import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, asyncHandler } from '../lib/errors.js';
import { requireSession } from '../middleware/session.js';
import { effectForItem } from '../services/render/payloads.js';
import { readImageInfo } from '../lib/imageInfo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAKEUP_FILE = path.resolve(__dirname, '../data/makeup_products.json');

const OCCASIONS = [
  { id: 'office', label: 'Office & Daily', description: 'Polished, subtle elegance for work and professional meetings.' },
  { id: 'party', label: 'Party & Evening', description: 'Bold, glamorous definition with luminous glow for night celebrations.' },
  { id: 'festive', label: 'Festive & Wedding', description: 'Opulent, radiant tones that harmonize with rich ethnic silks and zari.' },
  { id: 'date-night', label: 'Date Night', description: 'Romantic berry lips, sculpted eyes, and soft blushing cheeks.' },
  { id: 'brunch', label: 'Brunch & Casual', description: 'Fresh, sun-kissed natural glow with breezy coral hues.' },
];

function loadLocalMakeupProducts() {
  try {
    if (fs.existsSync(MAKEUP_FILE)) {
      return JSON.parse(fs.readFileSync(MAKEUP_FILE, 'utf8'));
    }
  } catch (err) {
    console.warn('Could not read makeup_products.json', err.message);
  }
  return [];
}

export function makeupRoutes({ sessions, skin, catalogs, storage, gateway, logger }) {
  const router = Router();
  const auth = requireSession(sessions);

  // GET /api/makeup/recommendations?occasion=xxx
  router.get(
    '/api/makeup/recommendations',
    auth,
    asyncHandler(async (req, res) => {
      const occasion = req.query.occasion || 'office';
      const stored = skin.current(req.session);
      const profile = stored ? skin.present(stored, req.session) : null;

      const depth = profile?.depth?.id ?? 'medium';
      const undertone = profile?.undertone?.id ?? 'warm';

      const localProducts = loadLocalMakeupProducts();

      // Also fetch any makeup products uploaded by retailers in the catalog
      let catalogProducts = [];
      try {
        const cat = await catalogs.getEffective(req.session?.catalogId);
        if (cat?.items) {
          catalogProducts = cat.items.filter((item) =>
            ['lipstick', 'blush', 'eyeliner', 'eyeshadow', 'foundation', 'eyebrow', 'bronzer', 'concealer', 'contour'].includes(item.type),
          );
        }
      } catch (err) {
        logger?.warn?.({ err: err.message }, 'could not fetch catalog makeup items');
      }

      const allCombined = [
        ...localProducts,
        ...catalogProducts.map((p) => ({
          id: p.id,
          type: p.type,
          name: p.name,
          brand: p.brand || p.seller || 'Designer Collection',
          price: p.price,
          image_url: p.imageUrl,
          product_url: p.productUrl || '#',
          colours: p.colours?.map((c) => (typeof c === 'string' ? c : c.hex)) ?? ['#C46875'],
          finish: p.finish || 'matte',
          undertones: [undertone],
          depths: [depth],
          occasions: p.occasions || [occasion],
          tip: `Retailer collection piece suited for ${p.type}.`,
        })),
      ];

      // Match products for this occasion and skin tone
      const scored = allCombined.map((p) => {
        let score = 0;
        if (p.occasions?.includes(occasion)) score += 3;
        if (p.undertones?.includes(undertone)) score += 2;
        if (p.depths?.includes(depth)) score += 2;
        return { product: p, score };
      });

      scored.sort((a, b) => b.score - a.score);

      const pickedTypes = new Set();
      const recommended = [];
      const order = ['foundation', 'eyeshadow', 'eyeliner', 'blush', 'lipstick'];

      for (const t of order) {
        const match = scored.find((s) => s.product.type === t && !pickedTypes.has(s.product.id));
        if (match) {
          pickedTypes.add(match.product.id);
          recommended.push(match.product);
        }
      }

      // Generate personalized beauty consultation advice
      const undertoneName = profile?.undertone?.label ?? 'Warm';
      const depthName = profile?.depth?.label ?? 'Medium';
      const occObj = OCCASIONS.find((o) => o.id === occasion) ?? OCCASIONS[0];

      const advice = `For your ${depthName} skin with ${undertoneName.toLowerCase()} undertones, ${occObj.description.toLowerCase()} We've curated a custom makeup palette that complements your complexion and will stay radiant throughout the event.`;

      // Check user's selfie status
      const selfie = req.session?.photos?.selfie;
      const selfieUrl = selfie?.source === 'sample'
        ? `/samples/${selfie.sampleId}/selfi.png`
        : selfie?.publicId && storage?.isConfigured?.()
          ? storage.signedUrl(selfie.publicId)
          : null;

      res.json({
        occasion,
        occasions: OCCASIONS,
        skinProfile: {
          hasProfile: Boolean(profile),
          depth: profile?.depth ?? { id: depth, label: depthName },
          undertone: profile?.undertone ?? { id: undertone, label: undertoneName },
          summary: `${depthName} depth • ${undertoneName} undertone`,
        },
        advice,
        recommended,
        allProducts: allCombined,
        selfie: {
          hasPhoto: Boolean(selfie),
          url: selfieUrl,
          source: selfie?.source ?? null,
        },
      });
    }),
  );

  // POST /api/makeup/preview
  // Applies YouCam makeup-vto on the user's selfie
  router.post(
    '/api/makeup/preview',
    auth,
    asyncHandler(async (req, res) => {
      const { productIds = [] } = req.body ?? {};
      const selfie = req.session?.photos?.selfie;

      if (!selfie) {
        throw new AppError('NO_PHOTO', 'Upload a selfie or pick a sample photo at /start to try on makeup.', 400);
      }

      const localProducts = loadLocalMakeupProducts();
      let catalogProducts = [];
      try {
        const cat = await catalogs.getEffective(req.session?.catalogId);
        catalogProducts = cat?.items ?? [];
      } catch {
        // ignore
      }

      const all = [...localProducts, ...catalogProducts];
      const selectedProducts = productIds.map((id) => all.find((p) => p.id === id)).filter(Boolean);

      // Build effects array for YouCam makeup-vto
      const effects = selectedProducts
        .map((p) => effectForItem(p))
        .filter(Boolean);

      if (!effects.length) {
        throw new AppError('INVALID_INPUT', 'Select at least one makeup product to preview.', 400);
      }

      // Load selfie image buffer
      let buffer;
      let contentType = 'image/jpeg';
      let fileName = 'selfie.jpg';

      try {
        if (selfie.source === 'sample') {
          const samplePath = path.resolve(__dirname, `../../../client/public/samples/${selfie.sampleId}/selfi.png`);
          if (fs.existsSync(samplePath)) {
            buffer = fs.readFileSync(samplePath);
          } else {
            buffer = fs.readFileSync(path.resolve(__dirname, '../../../client/public/samples/sample-a/selfi.png'));
          }
        } else if (selfie.publicId && storage?.isConfigured?.()) {
          buffer = await storage.readBuffer(selfie.publicId, { maxSide: 1600 });
        } else {
          throw new Error('Selfie photo storage unavailable');
        }

        const info = readImageInfo(buffer);
        if (info?.format === 'png') {
          contentType = 'image/png';
          fileName = 'selfie.png';
        }
      } catch (err) {
        logger?.error?.({ err: err.message }, 'could not load selfie for makeup preview');
        throw new AppError('PHOTO_UNREADABLE', 'Could not load your selfie. Please try uploading again.', 422);
      }

      const input = { buffer, contentType, fileName };

      const sid = req.session?._id || req.session?.id || req.session?.sessionId || req.get('x-session-id');

      // Call gateway to run makeup-vto
      try {
        const result = await gateway.runTask({
          sessionId: sid,
          requestId: req.id,
          feature: 'makeup-vto',
          files: [{ field: 'src_file_id', ...input }],
          params: { version: '1.0', effects },
          storeResult: true,
        });

        const asset = result.stored?.[0];
        if (!asset?.publicId) {
          throw new AppError('RENDER_FAILED', 'YouCam processed the makeup but could not store the result.', 502);
        }

        const signedUrl = storage.signedUrl(asset.publicId);
        return res.json({
          ok: true,
          imageUrl: signedUrl,
          effectsCount: effects.length,
          units: result.units ?? 1,
        });
      } catch (err) {
        logger?.warn?.({ err: err.message, code: err.code }, 'makeup preview task failed');
        // Return friendly error or fallback preview
        throw new AppError(err.code || 'RENDER_FAILED', err.message || 'Could not apply makeup to your photo. Please try again.', err.status || 500);
      }
    }),
  );

  return router;
}
