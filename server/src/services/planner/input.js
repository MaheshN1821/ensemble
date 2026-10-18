import { BUDGET } from '../../config/intake.js';
import { AppError } from '../../lib/errors.js';

/** Only the refinements a shopper may send directly. Typed requests arrive through the agent in Stage 7. */
export function parsePlanBody(body) {
  const b = body ?? {};
  const constraints = {};
  if (b.budgetInr !== undefined && b.budgetInr !== null) {
    if (!Number.isInteger(b.budgetInr) || b.budgetInr < BUDGET.min || b.budgetInr > BUDGET.max) {
      throw new AppError('INVALID_INPUT', `Choose a budget between ₹${BUDGET.min.toLocaleString('en-IN')} and ₹${BUDGET.max.toLocaleString('en-IN')}.`, 400, { field: 'budgetInr' });
    }
    constraints.budgetInr = b.budgetInr;
  }
  if (b.excludeItemIds !== undefined) {
    if (!Array.isArray(b.excludeItemIds) || b.excludeItemIds.length > 30 || b.excludeItemIds.some((x) => typeof x !== 'string' || x.length > 80)) {
      throw new AppError('INVALID_INPUT', 'excludeItemIds must be a list of up to 30 item ids.', 400, { field: 'excludeItemIds' });
    }
    constraints.excludeItemIds = [...new Set(b.excludeItemIds)];
  }
  return constraints;
}
