/**
 * Quick checks in the browser so people learn about a problem before uploading 10 MB.
 * The server repeats every check; the rules come from GET /api/intake/config so both sides agree.
 */
const TYPES = ['image/jpeg', 'image/png'];

function loadDimensions(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error('unreadable'));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export const formatMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Returns { ok: true, width, height } or { ok: false, message } with a message that says what to do. */
export async function checkPhoto(blob, kind, config) {
  const rules = config.photoRules[kind];
  if (!TYPES.includes(blob.type)) {
    return {
      ok: false,
      message: 'Use a JPG or PNG photo. iPhone photos in HEIC format do not work: take a new photo with the camera here, or export the photo as JPG first.',
    };
  }
  if (blob.size > config.maxPhotoBytes) {
    return { ok: false, message: `That photo is ${formatMb(blob.size)}. Choose one under ${formatMb(config.maxPhotoBytes)}.` };
  }
  let dims;
  try {
    dims = await loadDimensions(blob);
  } catch {
    return { ok: false, message: 'That file could not be opened as a photo. Choose a different one.' };
  }
  const short = Math.min(dims.width, dims.height);
  const long = Math.max(dims.width, dims.height);
  if (short < rules.minShortSide || long < rules.minLongSide) {
    return {
      ok: false,
      message: `That photo is ${dims.width} by ${dims.height} pixels. Use one at least ${rules.minShortSide} by ${rules.minLongSide} pixels, such as the original from your camera.`,
    };
  }
  if (rules.mustBePortrait && dims.height < dims.width * 1.2) {
    return {
      ok: false,
      message: 'The full-length photo needs to be upright (taller than wide) so your whole outfit fits. Use a portrait photo.',
    };
  }
  return { ok: true, ...dims };
}
