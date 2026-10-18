import { LIP } from '../../config/render.js';
import { AppError } from '../../lib/errors.js';

/**
 * Builds the YouCam task request for one stage. Pure: no network, no storage.
 *
 * `input` is the image to draw on, `product` is the catalog photo (not used for lipstick), both { buffer, contentType, fileName }.
 * Returns { feature, files, params } for gateway.runTask.
 *
 * Verified against the YouCam docs (Oct 2026):
 *   clothes   POST /task/cloth-v4        src_file_id, ref_file_id, garment_category
 *   makeup    POST /task/makeup-vto      src_file_id, version, effects[{category:'lip_color', shape, style, palettes[]}]
 * The earring and necklace endpoints (/task/2d-vto/<kind>) are described two ways in the docs, so three payload
 * styles are supported (config.render.vtoStyle) and the render service falls back between them on a 400:
 *   files  src_file_id + ref_file_ids[]
 *   info   source_info.name + object_infos[0].name
 *   both   all of the above in one request
 */
export const VTO_STYLES = ['files', 'info', 'both'];

const file = (field, f, extra = {}) => ({ field, buffer: f.buffer, fileName: f.fileName, contentType: f.contentType, ...extra });

export function lipTexture(name = '') {
  const hit = LIP.textures.find((t) => t.match.test(name));
  return hit ? { texture: hit.texture, ...hit.extra } : { texture: LIP.defaultTexture };
}

export function lipEffect(item) {
  const hex = item.colours?.[0]?.hex;
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) {
    throw new AppError('ITEM_IMAGE_UNUSABLE', `${item.name} has no lipstick colour, so it cannot be drawn. Add a colour for it in the catalog.`, 422);
  }
  return {
    category: 'lip_color',
    shape: { name: 'original' },
    morphology: { fullness: 0, wrinkless: 0 },
    style: { type: 'full' },
    palettes: [{ color: hex.toUpperCase(), colorIntensity: LIP.intensity, ...lipTexture(item.name) }],
  };
}

function vtoFiles(style, input, product) {
  const src = file('src_file_id', input);
  const ref = file('ref_file_ids', product, { asArray: true });
  if (style === 'info') return [file('source_info.name', input), file('object_infos.0.name', product)];
  if (style === 'both') return [{ ...src, fields: ['src_file_id', 'source_info.name'] }, { ...ref, field: undefined, fields: [{ path: 'ref_file_ids', array: true }, 'object_infos.0.name'] }];
  return [src, ref];
}

export function buildRequest({ stage, item, features, vtoStyle = 'files', input, product }) {
  const feature = features[stage];
  if (!feature) throw new AppError('INTERNAL', `No YouCam feature is configured for ${stage}.`, 500);

  if (stage === 'outfit') {
    return {
      feature,
      files: [file('src_file_id', input), file('ref_file_id', product)],
      params: { garment_category: item.garmentCategory || 'auto' },
    };
  }
  if (stage === 'earrings' || stage === 'necklace') {
    return { feature, files: vtoFiles(vtoStyle, input, product), params: {} };
  }
  if (stage === 'lipstick') {
    return {
      feature,
      files: [file('src_file_id', input)],
      params: { version: '1.0', effects: [lipEffect(item)] },
    };
  }
  throw new AppError('INTERNAL', `Unknown render stage ${stage}.`, 500);
}
