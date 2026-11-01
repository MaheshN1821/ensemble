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
 * The earring, eyewear, and watch endpoints (/task/2d-vto/<kind>) are described two ways in the docs, so three payload
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
  let hex = item.colours?.[0]?.hex ?? (typeof item.colours?.[0] === 'string' ? item.colours[0] : null);
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) {
    hex = '#9B3C50';
  }
  return {
    category: 'lip_color',
    shape: { name: 'original' },
    morphology: { fullness: 0, wrinkless: 0 },
    style: { type: 'full' },
    palettes: [{ color: hex.toUpperCase(), colorIntensity: LIP.intensity, ...lipTexture(item.name) }],
  };
}

export function blushEffect(item) {
  let hex = item?.colours?.[0]?.hex ?? (typeof item?.colours?.[0] === 'string' ? item.colours[0] : null);
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) hex = '#DE6B7E';
  return {
    category: 'blush',
    pattern: { name: '1color1' },
    palettes: [
      {
        color: hex.toUpperCase(),
        texture: 'matte',
        colorIntensity: 60,
      },
    ],
  };
}

export function eyelinerEffect(item) {
  let hex = item?.colours?.[0]?.hex ?? (typeof item?.colours?.[0] === 'string' ? item.colours[0] : null);
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) hex = '#111111';
  return {
    category: 'eye_liner',
    pattern: { name: 'Arabic3' },
    palettes: [
      {
        color: hex.toUpperCase(),
        texture: 'matte',
        colorIntensity: 70,
      },
    ],
  };
}

export function eyeshadowEffect(item) {
  let hex = item?.colours?.[0]?.hex ?? (typeof item?.colours?.[0] === 'string' ? item.colours[0] : null);
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) hex = '#8C6754';
  return {
    category: 'eye_shadow',
    pattern: { name: '1color1' },
    palettes: [
      {
        color: hex.toUpperCase(),
        texture: 'matte',
        colorIntensity: 60,
      },
    ],
  };
}

export function foundationEffect(item) {
  let hex = item?.colours?.[0]?.hex ?? (typeof item?.colours?.[0] === 'string' ? item.colours[0] : null);
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) hex = '#D59B6A';
  return {
    category: 'foundation',
    palettes: [
      {
        color: hex.toUpperCase(),
        colorIntensity: 50,
        glowIntensity: 30,
        coverageIntensity: 50,
      },
    ],
  };
}

export function eyebrowEffect(item) {
  let hex = item?.colours?.[0]?.hex ?? (typeof item?.colours?.[0] === 'string' ? item.colours[0] : null);
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) hex = '#3B2F2F';
  return {
    category: 'eyebrow',
    pattern: { name: '1color1' },
    palettes: [
      {
        color: hex.toUpperCase(),
        texture: 'matte',
        colorIntensity: 60,
      },
    ],
  };
}

export function bronzerEffect(item) {
  let hex = item?.colours?.[0]?.hex ?? (typeof item?.colours?.[0] === 'string' ? item.colours[0] : null);
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) hex = '#8C5230';
  return {
    category: 'bronzer',
    pattern: { name: '1color1' },
    palettes: [
      {
        color: hex.toUpperCase(),
        texture: 'matte',
        colorIntensity: 50,
      },
    ],
  };
}

export function concealerEffect(item) {
  let hex = item?.colours?.[0]?.hex ?? (typeof item?.colours?.[0] === 'string' ? item.colours[0] : null);
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) hex = '#D2A379';
  return {
    category: 'concealer',
    palettes: [
      {
        color: hex.toUpperCase(),
        colorUnderEyeIntensity: 50,
        coverageLevel: 'medium',
      },
    ],
  };
}

export function contourEffect(item) {
  let hex = item?.colours?.[0]?.hex ?? (typeof item?.colours?.[0] === 'string' ? item.colours[0] : null);
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) hex = '#6B4423';
  return {
    category: 'contour',
    pattern: { name: '1color1' },
    palettes: [
      {
        color: hex.toUpperCase(),
        texture: 'matte',
        colorIntensity: 50,
      },
    ],
  };
}

export function effectForItem(item) {
  const t = item?.type ?? item?.category;
  if (t === 'lipstick') return lipEffect(item);
  if (t === 'blush') return blushEffect(item);
  if (t === 'eyeliner') return eyelinerEffect(item);
  if (t === 'eyeshadow') return eyeshadowEffect(item);
  if (t === 'foundation') return foundationEffect(item);
  if (t === 'eyebrow' || t === 'eyebrows') return eyebrowEffect(item);
  if (t === 'bronzer') return bronzerEffect(item);
  if (t === 'concealer') return concealerEffect(item);
  if (t === 'contour') return contourEffect(item);
  return null;
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
  if (stage === 'earrings' || stage === 'necklace' || stage === 'eyewear' || stage === 'watch') {
    const params = stage === 'watch'
      ? {
          object_infos: [{
            parameter: {
              watch_need_remove_background: true,
              watch_wearing_location: 0,
              watch_shadow_intensity: 0.3,
              watch_ambient_light_intensity: 1,
            },
          }],
        }
      : {};
    return { feature, files: vtoFiles(vtoStyle, input, product), params };
  }
  if (stage === 'lipstick') {
    return {
      feature,
      files: [file('src_file_id', input)],
      params: { version: '1.0', effects: [lipEffect(item)] },
    };
  }
  if (stage === 'blush' || stage === 'foundation') {
    const effectFn = { blush: blushEffect, foundation: foundationEffect };
    return { feature, files: [file('src_file_id', input)], params: { version: '1.0', effects: [effectFn[stage](item)] } };
  }
  throw new AppError('INTERNAL', `Unknown render stage ${stage}.`, 500);
}
