import { IMAGE_RULES } from '../../config/catalog.js';
import { readImageInfo } from '../../lib/imageInfo.js';
import { decodePng } from '../../lib/png.js';
import { coloursFromPixels } from './colours.js';

/**
 * Looks at a downloaded product image (FR-14): is it a readable JPG/PNG, is it big enough for its type, and is its shape
 * right. Rejections are `errors`; things worth fixing but not blocking are `warnings`.
 * Colours are read locally for PNG (no native image library needed); JPEG colours come from storage (see importer).
 */
export function checkImage(buffer, type) {
  const rules = IMAGE_RULES[type];
  const errors = [];
  const warnings = [];
  const info = readImageInfo(buffer);
  if (!info) {
    errors.push({ field: 'image_url', message: 'The link did not return a JPG or PNG photo. Use a direct link to a .jpg or .png file.' });
    return { info: null, errors, warnings, pixels: null };
  }
  const short = Math.min(info.width, info.height);
  const long = Math.max(info.width, info.height);
  if (short < rules.minShortSide || long < rules.minLongSide) {
    errors.push({ field: 'image_url', message: `The photo is ${info.width} by ${info.height} pixels. For this item use ${rules.note}.` });
  }
  if (rules.minAspect && info.height / info.width < rules.minAspect) {
    warnings.push({ field: 'image_url', message: 'This outfit photo is wider than it is tall. Try-on works best with an upright photo of the whole garment.' });
  }
  let pixels = null;
  if (!errors.length && info.format === 'png') {
    const decoded = decodePng(buffer);
    if (decoded) pixels = coloursFromPixels(decoded);
  }
  if (pixels && !pixels.plainBackground) {
    warnings.push({ field: 'image_url', message: 'The background is not plain. Try-on and colour reading work best on a white or single-colour background.' });
  }
  return { info, errors, warnings, pixels };
}
