import { randomBytes } from 'node:crypto';
import { AppError } from '../../lib/errors.js';
import { COUNTED_TOOLS, LIMITS, publicAgentConfig } from '../../config/agent.js';
import { DEFAULT_FEATURES, STAGES } from '../../config/render.js';
import { effectiveProfile } from '../skin/profile.js';
import { primaryColour } from '../planner/score.js';
import { rescoreLook } from '../planner/plan.js';
import { validateOps, summariseOp } from './intent.js';
import { opsForChip, readRequest } from './rules.js';
import { TurnCapError, applyOperations, nearestAlternatives } from './refine.js';
import { checkReply } from './llm.js';
import { createTraceStore } from './trace.js';

const LOOK_ID = /^look_[a-f0-9]{10}$/;
const money = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const NOUN = { outfit: 'outfit', necklace: 'necklace', earrings: 'earrings', lipstick: 'lipstick' };
const CAP_CODES = new Set(['SESSION_CAP', 'GLOBAL_CAP', 'RENDER_CAP']);
const priceOf = (items) => Object.values(items).reduce((s, i) => s + (i?.price ?? 0), 0);

/** Exactly one of: a typed message, a chip, or a direct action (pick one of the offered alternatives). */
export function parseTurnBody(body) {
  const b = body ?? {};
  if (typeof b.lookId !== 'string' || !LOOK_ID.test(b.lookId)) throw new AppError('INVALID_INPUT', 'Say which look to change.', 400, { field: 'lookId' });
  const given = ['message', 'chip', 'action'].filter((k) => b[k] !== undefined && b[k] !== null && b[k] !== '');
  if (given.length !== 1) throw new AppError('INVALID_INPUT', 'Type a request, or pick one of the quick options.', 400, { field: 'message' });
  if (b.message !== undefined && b.message !== null && b.message !== '') {
    if (typeof b.message !== 'string') throw new AppError('INVALID_INPUT', 'Type your request as text.', 400, { field: 'message' });
    const message = b.message.replace(/\s+/g, ' ').trim();
    if (!message) throw new AppError('INVALID_INPUT', 'Type a request, or pick one of the quick options.', 400, { field: 'message' });
    if (message.length > LIMITS.messageMax) throw new AppError('INVALID_INPUT', `Keep it under ${LIMITS.messageMax} characters.`, 400, { field: 'message' });
    return { lookId: b.lookId, message };
  }
  if (b.chip !== undefined && b.chip !== null && b.chip !== '') {
    const ops = typeof b.chip === 'string' ? opsForChip(b.chip) : null;
    if (!ops) throw new AppError('INVALID_INPUT', 'That quick option is not available.', 400, { field: 'chip' });
    return { lookId: b.lookId, chip: b.chip };
  }
  const a = b.action;
  if (!a || typeof a !== 'object' || a.op !== 'swap_item' || typeof a.slot !== 'string' || typeof a.itemId !== 'string') throw new AppError('INVALID_INPUT', 'That option is not available.', 400, { field: 'action' });
  return { lookId: b.lookId, action: { op: 'swap_item', slot: a.slot, itemId: a.itemId } };
}

/**
 * The agent layer (Stage 7). One turn = read the request, change the look through the planner, explain, draw only what changed.
 *
 *   request (typed, chip or option) -> operations (language model, or the keyword reader, or the chip's own list)
 *     -> validated -> planner swaps (hard budget, same scoring) -> reply written from the planner's facts
 *     -> renders.start (cache means only changed stages are drawn).
 *
 * Guardrails (PRD section 9): at most 6 counted tool calls and 3 renders per turn, a per-session turn cap and model cap,
 * validated arguments, no free-form image editing, out-of-scope requests declined with alternatives. Every step is
 * written to the trace as it happens.
 */
export function createAgentService({ config = {}, logger, sessions, catalogs, skin, renders, ledger, metrics, llm, trace = createTraceStore(), now = Date.now }) {
  const ac = config.agent ?? {};
  const turnCap = ac.sessionTurnCap ?? LIMITS.defaultSessionTurnCap;
  const llmCap = ac.sessionLlmCap ?? LIMITS.defaultSessionLlmCap;
  const explainWithModel = ac.llm?.explain !== false;
  const renderCap = config.render?.sessionRenderCap ?? 30;
  const features = { ...DEFAULT_FEATURES, ...(config.render?.features ?? {}) };
  const log = logger ?? { info() {}, warn() {}, error() {} };
  const turning = new Set();

  setInterval(() => trace.sweep(), 600_000).unref?.();

  // ---------- governor (FR-27) ----------

  async function governor(session) {
    const sid = session._id;
    const [used, today] = ledger ? await Promise.all([ledger.sessionUnits(sid), ledger.dailyUnits()]) : [0, 0];
    const unitCap = config.sessionUnitCap ?? null;
    const dailyCap = config.globalDailyUnitCap ?? null;
    const renderUsed = session.renderRuns ?? 0;
    const turns = session.agent?.turns ?? 0;
    const llmUsed = session.agent?.llmCalls ?? 0;
    const unitsLeft = unitCap == null ? null : Math.max(0, unitCap - used);
    const capped = (unitCap != null && used >= unitCap) || renderUsed >= renderCap || (dailyCap != null && today >= dailyCap);
    const near = !capped && ((unitCap != null && used >= unitCap * 0.8) || renderUsed >= renderCap * 0.8);
    return {
      state: capped ? 'capped' : near ? 'near' : 'ok',
      message: capped
        ? 'This session has reached its spending limit. Looks already drawn stay available; nothing new can be drawn.'
        : near ? 'This session is close to its spending limit.' : null,
      units: { used, cap: unitCap, left: unitsLeft },
      daily: { used: today, cap: dailyCap },
      renders: { used: renderUsed, cap: renderCap },
      turns: { used: turns, cap: turnCap },
      llm: { available: Boolean(llm?.available), model: llm?.available ? llm.model : null, used: llmUsed, cap: llmCap },
      perTurn: { toolCalls: LIMITS.toolCallsPerTurn, renders: LIMITS.rendersPerTurn, llmCalls: LIMITS.llmCallsPerTurn },
    };
  }

  // ---------- following a render in the trace ----------

  /** Mirrors the real stage states of a drawing into the trace: queued, running, then done (units, time, reused) or failed. */
  function follow({ session, lookId, turnId, renderEntryId }) {
    const sid = session._id;
    const stepOf = new Map();
    const seen = new Map();
    // `initial` marks a snapshot taken before this drawing reported anything: whatever is already done was drawn earlier.
    const onLook = (look, initial = false) => {
      for (let st of look.stages ?? []) {
        if (seen.get(st.id) === st.status) continue;
        seen.set(st.id, st.status);
        if (initial && st.status === 'done') { st = { ...st, cached: true, units: 0 }; }
        const def = STAGES.find((d) => d.id === st.id);
        const tool = st.cached ? 'cache' : `youcam/${features[def?.slot] ?? st.id}`;
        const input = `${st.label}: ${st.item?.name ?? ''}`;
        if (st.status === 'queued' || st.status === 'running') {
          if (!stepOf.has(st.id)) stepOf.set(st.id, trace.begin(sid, { turnId, tool, input, status: st.status }));
          else trace.update(sid, stepOf.get(st.id), { status: st.status });
        } else if (st.status === 'done' || st.status === 'failed') {
          const id = stepOf.get(st.id) ?? trace.begin(sid, { turnId, tool, input, status: 'running' });
          stepOf.set(st.id, id);
          if (st.status === 'done') trace.finish(sid, id, { tool, status: 'ok', cached: Boolean(st.cached), units: st.units ?? 0, durationMs: st.durationMs ?? 0, outcome: st.cached ? 'Reused from earlier, 0 units' : `Drawn, ${st.units} ${st.units === 1 ? 'unit' : 'units'}${st.unitsKnown ? '' : ' (estimated)'}` });
          else trace.finish(sid, id, { status: 'error', outcome: st.error?.message ?? 'This step did not finish.' });
        }
      }
    };
    const finish = async () => {
      try {
        const fresh = await sessions.get(sid);
        const look = fresh ? await renders.get(fresh, lookId) : null;
        if (look) {
          onLook(look, true);
          const done = look.stages.filter((s) => s.status === 'done').length;
          trace.finish(sid, renderEntryId, { status: look.status === 'failed' ? 'error' : 'ok', units: look.unitsSpent ?? 0, outcome: `${done} of ${look.stages.length} steps done, ${look.unitsSpent ?? 0} ${look.unitsSpent === 1 ? 'unit' : 'units'}` });
          return;
        }
      } catch { /* fall through */ }
      trace.finish(sid, renderEntryId, { status: 'ok', outcome: 'Finished' });
    };
    try {
      const sub = renders.watch(session, lookId, (event) => {
        if (event.type === 'look') onLook(event.data);
        else if (event.type === 'end') finish();
      });
      onLook(sub.initial, true);
      if (!sub.live) { sub.unsubscribe(); finish(); }
    } catch {
      trace.finish(sid, renderEntryId, { status: 'ok', outcome: 'Finished' });
    }
  }

  // ---------- the reply ----------

  function changeLine(c) {
    const { op, slot, from, to } = c;
    const noun = NOUN[slot] ?? 'item';
    if (c.note) return c.note;
    switch (op.op) {
      case 'change_formality': return `Made it ${op.shift < 0 ? 'less' : 'more'} formal by changing the outfit from ${from.name} to ${to.name} (${money(to.price)}).`;
      case 'change_lipstick': return `Changed the lipstick from ${from?.name ?? 'none'} to ${to.name}${op.change === 'different' ? '' : `, a ${op.change} shade`} (${money(to.price)}).`;
      case 'change_colour_family': return `Changed the outfit from ${from.name} to ${to.name} (${money(to.price)}).`;
      case 'make_cheaper': return `Swapped ${from.name} for ${to.name}, which saves ${money(from.price - to.price)}.`;
      case 'change_metal': return `Switched the ${noun} from ${from.name} to ${to.name}.`;
      case 'exclude_item': return to ? `Replaced ${from.name} with ${to.name} and will not show ${from.name} again.` : `Removed ${from.name} and will not show it again.`;
      case 'remove_item': return `Removed the ${noun}, ${from.name}.`;
      case 'change_budget': return `Swapped ${from.name} for ${to.name} to fit the new budget.`;
      default: return to && from ? `Swapped the ${noun} ${from.name} for ${to.name} (${money(to.price)}).` : to ? `Added ${to.name} (${money(to.price)}).` : `Removed the ${noun}.`;
    }
  }

  function deterministicReply({ result, scored, prevScore, budget, unsupportedText, alternatives, notes, mode }) {
    const parts = [];
    if (mode === 'budget-only' && result.prefsPatch.budgetInr) parts.push(`Your budget is now ${money(result.prefsPatch.budgetInr)}. This look already fits.`);
    for (const c of result.changes) parts.push(changeLine(c));
    if (result.prefsPatch.budgetInr && result.changes.length && mode !== 'budget-only') parts.push(`Your budget is now ${money(result.prefsPatch.budgetInr)}.`);
    if (result.prefsPatch.metal && result.changes.length && !result.changes.some((c) => c.op.op === 'change_metal')) parts.push('I will prefer that metal from now on.');
    if (scored && result.changed) {
      const left = budget - scored.totalPrice;
      parts.push(`The look is now ${money(scored.totalPrice)}, ${money(left)} under your ${money(budget)} budget. Match score ${scored.score}${prevScore != null && prevScore !== scored.score ? `, was ${prevScore}` : ''}.`);
    }
    for (const f of result.failures) parts.push(f.message);
    if (result.unsupported.length) parts.push(unsupportedText + (alternatives.length ? ' These are the closest options:' : ''));
    for (const n of notes) parts.push(n);
    if (result.skipped.length) parts.push('That was a lot for one go, so the last request was skipped. Ask for it again as its own request.');
    if (!parts.length) parts.push('Nothing changed.');
    return parts.join(' ');
  }

  const UNSUPPORTED_TEXT = 'I choose from the catalog, so I cannot change a garment itself, such as its length, sleeves or fit.';
  const UNSUPPORTED_OTHER = 'That is not something I can change. I can swap items from the catalog, change how formal the look is, the lipstick shade, the jewellery metal, the colour family or your budget.';

  // ---------- one turn ----------

  async function turn(session, rawInput, { requestId = null } = {}) {
    const input = parseTurnBody(rawInput);
    const sid = session._id;
    if (turning.has(sid)) throw new AppError('AGENT_BUSY', 'Still working on your last request. Wait a moment, then try again.', 409);
    turning.add(sid);
    try {
      return await runTurn(session, input, requestId);
    } finally {
      turning.delete(sid);
    }
  }

  async function runTurn(session, input, requestId) {
    const sid = session._id;
    const started = now();
    const turnId = `turn_${randomBytes(4).toString('hex')}`;

    if (!session.consent?.over18) throw new AppError('CONSENT_REQUIRED', 'Confirm the consent screen first.', 403);
    if (!session.preferences) throw new AppError('PREFERENCES_REQUIRED', 'Add your occasion and budget first, then we can plan your looks.', 409);
    if (!session.photos?.selfie || !session.photos?.body) throw new AppError('PHOTOS_REQUIRED', 'Add your selfie and full-length photo first, or choose a sample model.', 409);
    const stored = skin.current(session);
    if (!stored) throw new AppError('NO_PROFILE', 'Read your skin tone first, then we can plan looks to match it.', 409);
    const usedTurns = session.agent?.turns ?? 0;
    if (usedTurns >= turnCap) throw new AppError('AGENT_TURN_CAP', 'This session has used all its refinements. Your looks stay available, and you can still draw or share them.', 429, { cap: turnCap });

    const looks = await renders.list(session);
    const current = looks.find((l) => l.id === input.lookId);
    if (!current) throw new AppError('NOT_FOUND', 'That look is not in your session any more. Plan your looks again.', 404);
    if (looks.some((l) => l.active)) throw new AppError('RENDER_BUSY', 'A look is still being drawn. Wait for it to finish, then ask for the change.', 409);

    // ---- tool wrapper: records every step in the trace and enforces the per-turn allowance ----
    let toolCalls = 0;
    let llmCalls = 0;
    let rendersThisTurn = 0;
    const tool = (name, summary, fn, describe) => {
      if (COUNTED_TOOLS.has(name)) {
        if (toolCalls >= LIMITS.toolCallsPerTurn) {
          trace.add(sid, { turnId, tool: name, input: summary, status: 'skipped', outcome: `Stopped: ${LIMITS.toolCallsPerTurn} tool calls per request is the limit` });
          throw new TurnCapError();
        }
        toolCalls += 1;
      }
      const id = trace.begin(sid, { turnId, tool: name, input: summary });
      const t0 = now();
      try {
        const out = fn();
        const ok = out?.ok !== false;
        trace.finish(sid, id, { status: ok ? 'ok' : 'no_result', durationMs: now() - t0, outcome: describe ? describe(out) : ok ? (out?.look ? `${out.look.items ? 'found' : 'ok'}` : 'ok') : out.message ?? 'no result' });
        return out;
      } catch (err) {
        trace.finish(sid, id, { status: 'error', durationMs: now() - t0, outcome: err?.message ?? 'failed' });
        throw err;
      }
    };

    // ---- context (free tools) ----
    const profile = effectiveProfile(stored);
    trace.add(sid, { turnId, tool: 'get_profile', input: 'current session', outcome: `${profile.undertone} undertone, ${profile.depth}${stored.override ? ' (adjusted by you)' : ''}` });
    const { items: catalogItems, catalog: usedCatalog } = await catalogs.itemsForSession(session);
    trace.add(sid, { turnId, tool: 'search_catalog', input: 'items for this session', outcome: `${catalogItems.length} items` });
    const byId = new Map(catalogItems.map((i) => [i.id, i]));
    const lookItems = {};
    for (const [slot, i] of Object.entries(current.items)) {
      const item = byId.get(i.id);
      if (!item) throw new AppError('ITEM_NOT_FOUND', 'One of the items in this look is no longer in the catalog. Plan your looks again.', 409, { itemId: i.id });
      lookItems[slot] = item;
    }
    const prefs = session.preferences;
    const excluded = session.agent?.excludeItemIds ?? [];

    // ---- read the request ----
    let mode;
    let ops = [];
    let notes = [];
    let llmNote = null;
    let llmUsed = false;
    const readId = trace.begin(sid, { turnId, tool: 'parse_intent', input: input.chip ? `chip: ${input.chip}` : input.action ? `option: ${input.action.itemId}` : input.message });
    const t0 = now();
    if (input.chip || input.action) {
      mode = input.chip ? 'chip' : 'action';
      const v = validateOps(input.chip ? opsForChip(input.chip) : [input.action]);
      ops = v.ops;
      trace.finish(sid, readId, { status: 'ok', durationMs: now() - t0, outcome: `${mode}: ${ops.map(summariseOp).join(', ') || 'nothing'}` });
    } else {
      const llmLeft = (session.agent?.llmCalls ?? 0) < llmCap;
      let viaModel = false;
      if (llm?.available && llmLeft) {
        try {
          llmCalls += 1;
          const raw = await llm.readRequest({
            message: input.message,
            occasion: prefs.occasion === 'other' ? prefs.occasionText || 'other' : prefs.occasion,
            budgetInr: prefs.budgetInr,
            items: Object.entries(lookItems).map(([slot, i]) => ({ slot, id: i.id, name: i.name, price: i.price, formality: i.formality, family: primaryColour(i)?.family ?? null })),
          });
          const v = validateOps(raw);
          if (v.ops.length) { ops = v.ops; viaModel = true; if (v.rejected.length) notes.push('Part of that request could not be used.'); }
          else if (Array.isArray(raw) && raw.length === 0) { ops = [{ op: 'unsupported', reason: 'nothing the catalog can change' }]; viaModel = true; }
          else llmNote = 'The language model answer could not be used, so a simpler reader was used.';
          llmUsed = true;
        } catch (err) {
          llmNote = 'The language model was unavailable, so a simpler reader was used.';
          log.warn({ code: err?.code }, 'language model request failed, using the keyword reader');
          trace.add(sid, { turnId, tool: 'language_model', input: 'read request', status: 'error', outcome: err?.code ?? 'failed' });
        }
      } else if (llm?.available) {
        llmNote = 'This session has used its language model allowance, so a simpler reader was used.';
      }
      if (viaModel) mode = 'llm';
      else {
        mode = 'rules';
        const r = readRequest(input.message);
        ops = validateOps(r.ops).ops;
        notes = [...notes, ...r.notes];
      }
      trace.finish(sid, readId, { status: 'ok', durationMs: now() - t0, outcome: `${viaModel ? `language model (${llm.model})` : llm?.available ? 'keyword reader (fallback)' : 'keyword reader'}: ${ops.map(summariseOp).join(', ') || 'nothing'}` });
    }

    // ---- act: the planner does the choosing ----
    const result = applyOperations({ ops, catalogItems, lookItems, profile, prefs, excluded, tool });

    let alternatives = [];
    let unsupportedText = '';
    if (result.unsupported.length) {
      const garment = result.unsupported.some((u) => /garment|edit|length|sleeve|fit/i.test(u.reason)) || result.unsupported.some((u) => u.slot === 'outfit');
      unsupportedText = garment ? UNSUPPORTED_TEXT : UNSUPPORTED_OTHER;
      const slot = result.unsupported.find((u) => u.slot)?.slot ?? 'outfit';
      try {
        alternatives = nearestAlternatives({ slot, lookItems: result.items, catalogItems, profile, prefs: { ...prefs, budgetInr: result.budget, metal: result.metal ?? 'any' }, excluded: [...excluded, ...result.excludeAdd], tool });
      } catch (err) { if (!(err instanceof TurnCapError)) throw err; }
    }

    // ---- rescore and check the budget (the planner's own numbers) ----
    const effPrefs = { ...prefs, budgetInr: result.budget, metal: result.metal ?? prefs.metal };
    let scored = null;
    if (result.changed) {
      try {
        scored = tool('score_look', `${Object.keys(result.items).length} items`, () => rescoreLook({ look: { items: result.items, rank: 1 }, profile, prefs: effPrefs, constraints: { excludeItemIds: [...excluded, ...result.excludeAdd] } }), (l) => `score ${l.score}, ${money(l.totalPrice)}`);
      } catch (err) { if (!(err instanceof TurnCapError)) throw err; }
      const total = scored?.totalPrice ?? priceOf(result.items);
      trace.add(sid, { turnId, tool: 'get_budget_status', input: 'new look', status: total <= result.budget ? 'ok' : 'error', outcome: `${money(total)} of ${money(result.budget)}${total <= result.budget ? '' : ', over budget'}` });
      if (total > result.budget) throw new AppError('OVER_BUDGET', `That change would cost ${money(total)}, over your ${money(result.budget)} budget, so it was not made.`, 409);
    }

    // ---- explain, from facts ----
    const budgetOnly = !result.changed && Boolean(result.prefsPatch.budgetInr) && !result.failures.length;
    const facts = {
      changes: result.changes.map((c) => ({ kind: c.op.op, slot: c.slot, from: c.from, to: c.to, note: c.note ?? null })),
      couldNotDo: result.failures.map((f) => f.message),
      notes,
      unsupported: result.unsupported.length ? unsupportedText : null,
      alternatives: alternatives.map((a) => ({ slot: a.slot, itemId: a.itemId, name: a.name, price: a.price })),
      look: scored ? { totalPrice: scored.totalPrice, budgetInr: result.budget, matchScore: scored.score, previousMatchScore: current.score ?? null, reasons: (scored.reasons ?? []).slice(0, 3), cautions: (scored.cautions ?? []).slice(0, 2) } : null,
      newBudgetInr: result.prefsPatch.budgetInr ?? null,
    };
    let reply = deterministicReply({ result, scored, prevScore: current.score ?? null, budget: result.budget, unsupportedText, alternatives, notes, mode: budgetOnly ? 'budget-only' : 'normal' });
    let replySource = 'planner';
    const explainId = trace.begin(sid, { turnId, tool: 'explain_look', input: `${result.changes.length} changes` });
    const e0 = now();
    const canExplain = explainWithModel && llm?.available && ((session.agent?.llmCalls ?? 0) + llmCalls) < llmCap && llmCalls < LIMITS.llmCallsPerTurn && (result.changes.length || result.unsupported.length || result.failures.length);
    let explainOutcome = 'written from the planner\'s facts';
    if (canExplain) {
      try {
        llmCalls += 1;
        const out = await llm.writeReply(facts);
        const ids = new Set([...result.changes.flatMap((c) => [c.from?.id, c.to?.id]), ...alternatives.map((a) => a.itemId)].filter(Boolean));
        const amounts = new Set([
          ...Object.values(result.items).map((i) => i.price), ...result.changes.flatMap((c) => [c.from?.price, c.to?.price, c.from && c.to ? Math.abs(c.from.price - c.to.price) : null]),
          ...alternatives.map((a) => a.price), result.budget, scored?.totalPrice, scored ? result.budget - scored.totalPrice : null, result.prefsPatch.budgetInr,
        ].filter((n) => Number.isFinite(n)));
        const ok = checkReply(out, { allowedIds: ids, allowedAmounts: amounts });
        if (ok) { reply = ok; replySource = 'language-model'; llmUsed = true; explainOutcome = `language model (${llm.model}), checked against the facts`; }
        else explainOutcome = 'model reply did not match the facts, used the planner\'s wording';
      } catch (err) {
        explainOutcome = `model unavailable (${err?.code ?? 'error'}), used the planner's wording`;
      }
    } else if (llm?.available && explainWithModel) explainOutcome = 'planner wording (model allowance for this request or session used)';
    trace.finish(sid, explainId, { status: 'ok', durationMs: now() - e0, outcome: explainOutcome });

    // ---- persist what the shopper asked to keep, then draw ----
    const set = { 'agent.turns': usedTurns + 1, 'agent.llmCalls': (session.agent?.llmCalls ?? 0) + llmCalls };
    if (result.excludeAdd.length) set['agent.excludeItemIds'] = [...new Set([...excluded, ...result.excludeAdd])].slice(-60);
    if (result.prefsPatch.budgetInr) set['preferences.budgetInr'] = result.prefsPatch.budgetInr;
    if (result.prefsPatch.metal) set['preferences.metal'] = result.prefsPatch.metal;
    const saved = await sessions.patch(sid, { set });
    if (!saved) throw new AppError('SESSION_EXPIRED', 'Your session has ended. Start again to continue.', 401);
    // Retailer counters (FR-29): which kinds of change shoppers ask for. Operation names only, never the typed text.
    {
      const counted = result.changes.map((c) => c.op.op);
      if (result.prefsPatch.budgetInr && !counted.includes('change_budget')) counted.push('change_budget');
      if (result.unsupported.length) counted.push('unsupported');
      if (counted.length) metrics?.refined({ catalogId: usedCatalog?.id ?? null }, counted);
    }

    let look = current;
    let renderError = null;
    let newLookId = current.id;
    let draw = { redraw: [], reused: [], estimatedUnits: 0 };
    if (result.changed) {
      const renderEntry = trace.begin(sid, { turnId, tool: 'render_look', input: `${Object.values(result.items).map((i) => i.name).join(', ')}`.slice(0, 150) });
      try {
        if (rendersThisTurn >= LIMITS.rendersPerTurn) throw new AppError('TURN_RENDER_CAP', 'One request can draw at most three looks.', 429);
        rendersThisTurn += 1;
        look = await renders.start(saved, { itemIds: Object.values(result.items).map((i) => i.id), budgetInr: result.budget, requestId });
        newLookId = look.id;
        const redraw = look.stages.filter((s) => s.status === 'queued' || s.status === 'running');
        draw = { redraw: redraw.map((s) => s.label), reused: look.stages.filter((s) => s.status === 'done').map((s) => s.label), estimatedUnits: 0 };
        try {
          const cfg = await renders.publicConfig();
          draw.estimatedUnits = redraw.reduce((n, s) => n + (cfg.stages.find((c) => c.id === s.id)?.units ?? 0), 0);
        } catch { /* the estimate is optional */ }
        follow({ session: saved, lookId: newLookId, turnId, renderEntryId: renderEntry });
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        renderError = { code: err.code, message: err.message, cap: CAP_CODES.has(err.code) };
        trace.finish(sid, renderEntry, { status: 'error', outcome: err.message });
        // A cap or a busy renderer still records the look, so the shopper can find it and draw it later.
        try {
          const fresh = await sessions.get(sid);
          if (fresh && scored?.id) { look = await renders.get(fresh, scored.id); newLookId = look.id; }
        } catch { /* the look was not recorded */ }
        if (look === current) newLookId = null;
      }
    }

    return {
      turn: {
        id: turnId,
        mode, llmUsed, llmNote,
        ops: ops.map((o) => ({ op: o.op, summary: summariseOp(o) })),
        changes: result.changes.map((c) => ({ op: c.op.op, slot: c.slot, from: c.from, to: c.to, note: c.note ?? null })),
        failures: result.failures.map((f) => f.message),
        notes,
        unsupported: result.unsupported.length > 0,
        alternatives,
        reply,
        replySource,
        unchanged: !result.changed,
        previousLookId: current.id,
        lookId: newLookId,
        look: newLookId ? look : null,
        draw,
        renderError,
        prefsChanged: result.prefsPatch,
        excluded: result.excludeAdd,
        toolCalls,
        durationMs: now() - started,
      },
      governor: await governor(saved),
    };
  }

  return {
    turn,
    governor,
    publicConfig: async () => publicAgentConfig({ llm, caps: { turns: turnCap, llmCalls: llmCap } }),
    trace: { list: (sid) => trace.list(sid), subscribe: (sid, cb) => trace.subscribe(sid, cb) },
    forget: (sid) => trace.clear(sid),
    llm: () => ({ available: Boolean(llm?.available), provider: llm?.provider ?? 'none', model: llm?.model ?? null }),
  };
}
