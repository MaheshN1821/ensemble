import { v2 as cloudinary } from 'cloudinary';

/**
 * Temporary image storage on Cloudinary. Everything is uploaded as `authenticated` (not publicly
 * guessable) under ensemble/<sessionId>/ and tagged with the session, so deleting a session is one call.
 * Expiring share links are enforced by our own server in Step 6; Cloudinary only holds the files.
 */
export function createCloudinaryStorage({ cloudName, apiKey, apiSecret }, logger) {
  const configured = Boolean(cloudName && apiKey && apiSecret);
  if (configured) cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });

  const tagFor = (sessionId) => `session_${sessionId}`;
  const toAsset = (r) => ({ publicId: r.public_id, bytes: r.bytes, width: r.width, height: r.height, format: r.format });

  return {
    provider: 'cloudinary',
    isConfigured: () => configured,

    async saveFromUrl({ sessionId, url, kind }) {
      const res = await cloudinary.uploader.upload(url, {
        folder: `ensemble/${sessionId}`,
        type: 'authenticated',
        resource_type: 'image',
        tags: [tagFor(sessionId), kind],
      });
      return toAsset(res);
    },

    async saveBuffer({ sessionId, buffer, kind }) {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: `ensemble/${sessionId}`, type: 'authenticated', resource_type: 'image', tags: [tagFor(sessionId), kind] },
          (err, res) => (err ? reject(err) : resolve(toAsset(res))),
        );
        stream.end(buffer);
      });
    },

    /** Downloads a stored photo so it can be sent to YouCam. Capped so a bad record cannot exhaust memory. */
    async readBuffer(publicId) {
      const res = await fetch(this.signedUrl(publicId), { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`Could not read stored photo (${res.status})`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > 12 * 1024 * 1024) throw new Error('Stored photo is larger than expected');
      return buffer;
    },

    signedUrl(publicId) {
      return cloudinary.url(publicId, { type: 'authenticated', sign_url: true, secure: true, resource_type: 'image' });
    },

    /** Deletes one stored photo. Safe to call for an id that no longer exists. */
    async deleteAsset(publicId) {
      if (!configured || !publicId) return;
      await cloudinary.uploader.destroy(publicId, { type: 'authenticated', resource_type: 'image', invalidate: true });
    },

    // ---- Catalog product images (Stage 4). Public delivery type: these are product photos the retailer chose to show. ----
    /** Stores a retailer's product photo and asks Cloudinary for its predominant colours. */
    async saveCatalogImage({ catalogId, itemId, buffer }) {
      const res = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: `ensemble-catalog/${catalogId}`, public_id: itemId, overwrite: true, resource_type: 'image', colors: true },
          (err, r) => (err ? reject(err) : resolve(r)),
        );
        stream.end(buffer);
      });
      // `colors` is [[hex, percent], ...]
      const colours = Array.isArray(res.colors) ? res.colors.map(([hex, weight]) => ({ hex, weight })) : [];
      return { url: res.secure_url, publicId: res.public_id, colours };
    },

    async deleteCatalogImage(publicId) {
      if (!configured || !publicId) return;
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    },

    async deleteCatalog(catalogId) {
      if (!configured) return { deleted: 0 };
      const res = await cloudinary.api.delete_resources_by_prefix(`ensemble-catalog/${catalogId}/`, { resource_type: 'image' });
      return { deleted: Object.values(res.deleted ?? {}).filter((v) => v === 'deleted').length };
    },

    async deleteSession(sessionId) {
      if (!configured) return { deleted: 0 };
      const res = await cloudinary.api.delete_resources_by_tag(tagFor(sessionId), { type: 'authenticated', resource_type: 'image' });
      const deleted = Object.values(res.deleted ?? {}).filter((v) => v === 'deleted').length;
      logger?.info({ sessionId, deleted }, 'session assets deleted');
      return { deleted };
    },
  };
}
