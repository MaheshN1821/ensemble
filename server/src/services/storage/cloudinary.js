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

    signedUrl(publicId) {
      return cloudinary.url(publicId, { type: 'authenticated', sign_url: true, secure: true, resource_type: 'image' });
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
