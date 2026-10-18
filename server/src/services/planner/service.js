import { AppError } from '../../lib/errors.js';
import { COMPONENTS, SCORE_NOTE, WEIGHTS } from '../../config/planner.js';
import { effectiveProfile } from '../skin/profile.js';
import { planLooks } from './plan.js';

export const plannerRules = () => ({
  scoreNote: SCORE_NOTE,
  weights: Object.entries(WEIGHTS).map(([key, weight]) => ({ key, weight, label: COMPONENTS[key].label, blurb: COMPONENTS[key].blurb })),
  budget: 'Your budget is a hard limit. Every look shown costs no more than it.',
});

/**
 * Glue between a session and the pure planner: reads the effective skin profile (override applied), the intake
 * preferences and the session's catalog. Spends no YouCam units and calls no language model.
 */
export function createPlannerService({ catalogs, skin }) {
  return {
    rules: plannerRules,

    async planForSession(session, { constraints = {} } = {}) {
      if (!session.consent?.over18) throw new AppError('CONSENT_REQUIRED', 'Confirm the consent screen first.', 403);
      if (!session.preferences) throw new AppError('PREFERENCES_REQUIRED', 'Add your occasion and budget first, then we can plan your looks.', 409);
      const stored = skin.current(session);
      if (!stored) throw new AppError('NO_PROFILE', 'Read your skin tone first, then we can plan looks to match it.', 409);

      const { catalog, items, fellBack } = await catalogs.itemsForSession(session);
      const profile = effectiveProfile(stored);
      const plan = planLooks({ items, profile, prefs: session.preferences, constraints });
      return {
        ...plan,
        catalog: { id: catalog.id, name: catalog.name, source: catalog.source, itemCount: catalog.itemCount, fellBack },
        profile: { ...profile, undertoneLabel: skin.present(stored, session).undertone.label, depthLabel: skin.present(stored, session).depth.label },
        constraints: {
          budgetInr: constraints.budgetInr ?? null,
          excludeItemIds: constraints.excludeItemIds ?? [],
        },
      };
    },
  };
}
