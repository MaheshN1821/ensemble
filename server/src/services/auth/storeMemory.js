/** In-memory account and token store, same methods as store.js. Used by tests. Imports nothing third-party. */
export function createMemoryAuthStore({ now = () => new Date() } = {}) {
  const accounts = new Map();
  const tokens = new Map();
  const clone = (v) => (v ? structuredClone(v) : null);
  return {
    accounts, tokens,
    findAccount: async (email, role) => clone([...accounts.values()].find((a) => a.email === email && a.role === role)),
    getAccount: async (id) => clone(accounts.get(id)),
    insertAccount: async (doc) => {
      if ([...accounts.values()].some((a) => a.email === doc.email && a.role === doc.role)) { const e = new Error('duplicate'); e.code = 11000; throw e; }
      accounts.set(doc._id, structuredClone(doc));
      return clone(doc);
    },
    updateAccount: async (id, set) => {
      if (!accounts.has(id)) return null;
      accounts.set(id, { ...accounts.get(id), ...structuredClone(set) });
      return clone(accounts.get(id));
    },
    deleteAccount: async (id) => { accounts.delete(id); },
    retailerCodeTaken: async (code) => [...accounts.values()].some((a) => a.retailer?.code === code),

    insertToken: async (doc) => { tokens.set(doc._id, structuredClone(doc)); },
    findToken: async (hash) => {
      const t = tokens.get(hash);
      return t && t.expiresAt > now() ? clone(t) : null;
    },
    touchToken: async (hash, set) => { if (tokens.has(hash)) tokens.set(hash, { ...tokens.get(hash), ...set }); },
    deleteToken: async (hash) => { tokens.delete(hash); },
    deleteTokensFor: async (accountId, { except = null } = {}) => { for (const [k, t] of tokens) if (t.accountId === accountId && k !== except) tokens.delete(k); },
  };
}
