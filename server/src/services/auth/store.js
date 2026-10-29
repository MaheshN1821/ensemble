import { Account } from '../../models/Account.js';
import { AuthToken } from '../../models/AuthToken.js';

/** Mongo account and token store. See storeMemory.js for the same interface in memory. */
export function createMongoAuthStore() {
  return {
    findAccount: (email, role) => Account.findOne({ email, role }).lean(),
    getAccount: (id) => Account.findById(id).lean(),
    async insertAccount(doc) { return (await Account.create(doc)).toObject(); },
    updateAccount: (id, set) => Account.findOneAndUpdate({ _id: id }, { $set: set }, { new: true }).lean(),
    deleteAccount: (id) => Account.deleteOne({ _id: id }),
    retailerCodeTaken: async (code) => Boolean(await Account.exists({ 'retailer.code': code })),

    insertToken: (doc) => AuthToken.create(doc),
    findToken: (hash) => AuthToken.findOne({ _id: hash, expiresAt: { $gt: new Date() } }).lean(),
    touchToken: (hash, set) => AuthToken.updateOne({ _id: hash }, { $set: set }),
    deleteToken: (hash) => AuthToken.deleteOne({ _id: hash }),
    deleteTokensFor: (accountId, { except = null } = {}) => AuthToken.deleteMany(except ? { accountId, _id: { $ne: except } } : { accountId }),
  };
}
