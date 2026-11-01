import { createHash } from 'node:crypto';
import { RENDER_KEY_VERSION } from '../../config/render.js';

const sha = (s) => createHash('sha1').update(s).digest('hex');

/**
 * Identity of a photo for the render cache (FR-19: cache by photo hash and item id).
 * Uploads carry a SHA-256 of their bytes (stored at upload time), so the same photo uploaded twice shares renders.
 * Sample models are fixed files, so their id is their identity. Older sessions without a hash fall back to the storage id.
 */
export function photoKey(photo, kind) {
  if (!photo) return null;
  if (photo.hash) return `h:${photo.hash}`;
  if (photo.source === 'sample') return `sample:${photo.sampleId}:${kind}`;
  return `upload:${photo.publicId}`;
}

/** What about an item changes how it is drawn. If a retailer re-imports an item with a new photo, the old render must not be reused. */
export function itemFingerprint(item) {
  return sha([item.type, item.imageUrl, item.garmentCategory ?? '', item.colours?.[0]?.hex ?? ''].join('|')).slice(0, 12);
}

/**
 * Cache key for one stage: the YouCam feature, the item (id + fingerprint) and the key of the image it draws on.
 * Because the input key is part of the key, changing only the lipstick re-runs only the lipstick: the earlier
 * results it draws on keep their keys.
 */
export function stageKey({ feature, stage, item, inputKey }) {
  return sha([RENDER_KEY_VERSION, feature, stage, item.id, itemFingerprint(item), inputKey].join('|')).slice(0, 24);
}
