#!/usr/bin/env node
/**
 * Generates the sample catalog images into client/public/catalog/sample/<itemId>.png.
 *
 *   npm run assets                 offline placeholders: flat, labelled-in-the-UI shapes in each item's colours. Free, deterministic.
 *   npm run assets -- --ai --yes   AI-generated images through YouCam's text-to-image API, from the `prompt` on each item.
 *                                  SPENDS UNITS (see --dry-run for the count). Needs YOUCAM_API_KEY in server/.env.
 *                                  Flags: --feature <id> (default ai-image-generator), --only <itemId>, --force (overwrite files).
 *
 * AI mode is UNVERIFIED against the live API: the feature id and payload below are a best reading of the docs.
 * Run one item first: npm run assets -- --ai --yes --only outfit-maroon-silk-saree
 * Everything generated must stay original, brand-free and labelled "Sample" in the app (PRD section 13).
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_ITEMS } from '../src/data/sampleCatalog.js';
import { encodePng } from '../src/lib/pngEncode.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/public/catalog/sample');
const exists = (p) => access(p).then(() => true, () => false);

const METAL_HEX = { gold: '#C9A23F', silver: '#B4B4BC', 'rose-gold': '#D9A59A', oxidised: '#5E5E66' };
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ---- tiny rasteriser: enough for flat product silhouettes on a white background ----
function canvas(w, h) {
  const data = Buffer.alloc(w * h * 4, 255);
  const put = (x, y, [r, g, b]) => { if (x >= 0 && y >= 0 && x < w && y < h) { const k = (y * w + x) * 4; data[k] = r; data[k + 1] = g; data[k + 2] = b; data[k + 3] = 255; } };
  return {
    w, h, data,
    rect(x0, y0, x1, y1, c) { for (let y = Math.round(y0); y < y1; y++) for (let x = Math.round(x0); x < x1; x++) put(x, y, c); },
    circle(cx, cy, r, c) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(x, y, c); },
    poly(pts, c) {
      const ys = pts.map((p) => p[1]);
      for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) {
        const xs = [];
        for (let i = 0; i < pts.length; i++) {
          const [ax, ay] = pts[i]; const [bx, by] = pts[(i + 1) % pts.length];
          if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
        }
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < xs[i + 1]; x++) put(x, y, c);
      }
    },
  };
}

function drawOutfit(item) {
  const W = 600; const H = 900; const cv = canvas(W, H);
  const main = hexRgb(item.colours[0].hex);
  const trim = hexRgb((item.colours[1] ?? item.colours[0]).hex);
  const cx = W / 2;
  switch (item.silhouette) {
    case 'saree': // draped length with a border down one side
      cv.poly([[cx - 120, 140], [cx + 150, 140], [cx + 190, 840], [cx - 170, 840]], main);
      cv.poly([[cx + 110, 140], [cx + 150, 140], [cx + 190, 840], [cx + 145, 840]], trim);
      cv.rect(cx - 120, 140, cx + 150, 175, trim);
      break;
    case 'lehenga': // short bodice and a wide skirt
      cv.rect(cx - 95, 130, cx + 95, 330, main);
      cv.rect(cx - 95, 300, cx + 95, 330, trim);
      cv.poly([[cx - 95, 330], [cx + 95, 330], [cx + 260, 840], [cx - 260, 840]], main);
      cv.poly([[cx - 245, 800], [cx + 245, 800], [cx + 260, 840], [cx - 260, 840]], trim);
      break;
    case 'kurta-set': // long tunic over straight trousers
      cv.poly([[cx - 110, 130], [cx + 110, 130], [cx + 135, 560], [cx - 135, 560]], main);
      cv.rect(cx - 80, 130, cx + 80, 165, trim);
      cv.rect(cx - 105, 560, cx - 8, 850, trim);
      cv.rect(cx + 8, 560, cx + 105, 850, trim);
      break;
    case 'western': // structured jacket
      cv.poly([[cx - 190, 150], [cx + 190, 150], [cx + 150, 700], [cx - 150, 700]], main);
      cv.poly([[cx - 30, 150], [cx + 30, 150], [cx, 330]], trim);
      break;
    default: // dress
      cv.poly([[cx - 100, 130], [cx + 100, 130], [cx + 120, 420], [cx + 230, 830], [cx - 230, 830], [cx - 120, 420]], main);
      cv.rect(cx - 120, 405, cx + 120, 435, trim);
  }
  return cv;
}

function drawNecklace(item) {
  const cv = canvas(600, 600);
  const metal = hexRgb(METAL_HEX[item.metalTone]);
  const stone = hexRgb((item.colours[1] ?? item.colours[0]).hex);
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const t = i / n; const x = 100 + t * 400; const y = 130 + 330 * (1 - (2 * t - 1) ** 2) * 0.62 - 40;
    cv.circle(x, y + 150 - 150, 11, metal);
    if (i % 4 === 0 && i > 4 && i < n - 4) cv.circle(x, y + 22, 9, stone);
  }
  cv.circle(300, 345, 38, metal); cv.circle(300, 345, 20, stone);
  return cv;
}

function drawEarrings(item) {
  const cv = canvas(600, 600);
  const metal = hexRgb(METAL_HEX[item.metalTone]);
  const stone = hexRgb((item.colours[1] ?? item.colours[0]).hex);
  for (const cx of [190, 410]) {
    cv.circle(cx, 150, 16, metal);
    cv.rect(cx - 4, 160, cx + 4, 240, metal);
    cv.poly([[cx - 60, 250], [cx + 60, 250], [cx + 20, 440], [cx - 20, 440]], metal);
    cv.circle(cx, 330, 24, stone);
  }
  return cv;
}

function drawLipstick(item) {
  const cv = canvas(400, 600);
  const shade = hexRgb(item.colours[0].hex);
  cv.rect(150, 330, 250, 520, hexRgb('#1A1A1F'));
  cv.rect(145, 300, 255, 335, hexRgb('#C9A23F'));
  cv.poly([[155, 300], [245, 300], [235, 160], [175, 130]], shade);
  cv.circle(310, 520, 40, shade);
  return cv;
}

const DRAW = { outfit: drawOutfit, necklace: drawNecklace, earrings: drawEarrings, lipstick: drawLipstick };

async function placeholders(items) {
  let wrote = 0;
  for (const it of items) {
    const file = path.join(OUT, `${it.itemId}.png`);
    if (!flag('force') && (await exists(file))) continue;
    const cv = DRAW[it.type](it);
    await writeFile(file, encodePng({ width: cv.w, height: cv.h, data: cv.data }));
    wrote++;
  }
  console.log(`placeholders: wrote ${wrote} file(s) to ${OUT} (${items.length - wrote} already present; use --force to overwrite)`);
}

async function ai(items) {
  await import('dotenv/config'); // only AI mode needs the API key
  const { loadEnv } = await import('../src/config/env.js');
  const { createYoucamClient } = await import('../src/services/youcam/client.js');
  const config = loadEnv();
  const feature = opt('feature', 'ai-image-generator');
  const todo = [];
  for (const it of items) if (flag('force') || !(await exists(path.join(OUT, `${it.itemId}.png`)))) todo.push(it);
  console.log(`${todo.length} image(s) to generate with feature "${feature}". Each successful task spends units (price: see /system > Fetch live prices).`);
  if (flag('dry-run') || !flag('yes')) { console.log('Not running. Add --yes to spend units, or --dry-run to preview.'); return; }

  const client = createYoucamClient({ apiKey: config.youcam.apiKey, baseUrl: config.youcam.baseUrl });
  const firstUrl = (v) => {
    if (typeof v === 'string' && /^https?:\/\//.test(v)) return v;
    if (v && typeof v === 'object') for (const x of Object.values(v)) { const f = firstUrl(x); if (f) return f; }
    return null;
  };
  for (const it of todo) {
    process.stdout.write(`  ${it.itemId} ... `);
    const created = await client.createTask(feature, { prompt: it.prompt });
    const taskId = created?.data?.task_id ?? created?.task_id;
    if (!taskId) throw new Error(`No task id in response: ${JSON.stringify(created).slice(0, 300)}`);
    let url = null;
    for (let i = 0; i < 40 && !url; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const t = await client.getTask(feature, taskId);
      const d = t?.data ?? t;
      if (d?.task_status === 'error') throw new Error(`Task failed: ${JSON.stringify(d).slice(0, 300)}`);
      if (d?.task_status === 'success') url = firstUrl(d.results);
    }
    if (!url) throw new Error('Timed out waiting for the image');
    const img = Buffer.from(await (await fetch(url)).arrayBuffer());
    await writeFile(path.join(OUT, `${it.itemId}.png`), img);
    console.log('ok');
  }
}

await mkdir(OUT, { recursive: true });
const only = opt('only', null);
const items = SAMPLE_ITEMS.filter((i) => !only || i.itemId === only);
if (!items.length) { console.error(`No sample item with id "${only}".`); process.exit(1); }
await (flag('ai') ? ai(items) : placeholders(items));
