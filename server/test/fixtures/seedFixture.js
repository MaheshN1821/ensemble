import { SAMPLE_ITEMS, FIXTURE_CATALOG_ID } from './sampleItems.js';

/** Fills a memory catalog repo with the 30 fixture items under the shared catalog id, as if the built-in catalog had been seeded. */
export async function seedFixture(repo) {
  const t = new Date();
  await repo.upsertCatalog({ _id: FIXTURE_CATALOG_ID, name: 'Ensemble catalog', source: 'main', version: 'fixture', createdAt: t, updatedAt: t });
  await repo.upsertItems(FIXTURE_CATALOG_ID, SAMPLE_ITEMS.map(({ prompt, ...item }) => ({ ...item, sku: item.itemId, origin: 'seed', retailerId: null, retailerName: null, uploadId: null, addedAt: t })));
}
