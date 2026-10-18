/**
 * Everything the render pipeline decides with, in one place (Stage 6).
 *
 * A look is drawn in stages (FR-18). The body panel is one stage; the face panel is a chain, because each jewellery
 * or makeup task draws on the previous result:
 *
 *   body panel:  outfit                      -> cloth try-on on the full-length photo
 *   face panel:  earrings -> necklace -> lipstick   (each one draws on the previous result, starting from the selfie)
 *
 * Feature ids come from the environment (config.render.features) so a wrong guess is fixed without a code change.
 */

export const AI_LABEL = 'AI preview. Colour and fit may differ from the real product.';

// Order matters: the face chain runs in this order.
export const STAGES = [
  { id: 'outfit', panel: 'body', slot: 'outfit', label: 'Outfit', doing: 'Putting the outfit on your photo' },
  { id: 'earrings', panel: 'face', slot: 'earrings', label: 'Earrings', doing: 'Adding the earrings' },
  { id: 'necklace', panel: 'face', slot: 'necklace', label: 'Necklace', doing: 'Adding the necklace' },
  { id: 'lipstick', panel: 'face', slot: 'lipstick', label: 'Lipstick', doing: 'Applying the lipstick' },
];
export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));
export const FACE_ORDER = STAGES.filter((s) => s.panel === 'face').map((s) => s.id);

export const DEFAULT_FEATURES = {
  outfit: 'cloth-v4',
  earrings: '2d-vto/earring',
  necklace: '2d-vto/necklace',
  lipstick: 'makeup-vto',
};

// Unit prices from the YouCam docs, used ONLY when neither YOUCAM_UNIT_OVERRIDES nor the live feature-cost
// endpoint gives a price. They are flagged "estimated" in the ledger. Earrings cost 2 units for stacked wear.
export const DOCUMENTED_UNITS = { outfit: 2, earrings: 1, necklace: 1, lipstick: 1 };

export const LIMITS = {
  maxLooksPerSession: 6, // FR-25
  defaultSessionRenderCap: 30, // stage runs against YouCam per session (cache hits do not count)
  faceMaxSide: 1600, // the makeup task rejects images with a long side of 1920 px or more
  bodyMaxSide: 2048, // the clothes task accepts up to 4096; smaller uploads are faster and cheaper to move
  garmentTimeoutMs: 15_000,
  garmentMaxBytes: 8 * 1024 * 1024,
  shareTtlHours: 24, // FR-21
  eventKeepAliveMs: 20_000,
  eventsKept: 120, // per job, for reconnecting clients and the Stage 7 trace
};

// Bump when payload shapes or stage order change, so old cached renders are never reused for a different request.
export const RENDER_KEY_VERSION = 'r1';

export const LIP = {
  intensity: 70,
  defaultTexture: 'matte',
  // Finishes are read from the product name. Anything unrecognised is drawn matte.
  textures: [
    { match: /gloss/i, texture: 'gloss', extra: { gloss: 60, transparencyIntensity: 30 } },
    { match: /sheer|tint|balm/i, texture: 'sheer', extra: { gloss: 40, transparencyIntensity: 50 } },
    { match: /satin|cream/i, texture: 'satin', extra: {} },
  ],
};

// Friendly wording for the engine error codes YouCam documents (FR-34). Keys are matched case-insensitively.
const FACE = 'We could not find a clear face in your selfie. Retake it facing the camera in even light, with nothing covering your face.';
const SMALL = 'Your face is too small in the selfie. Move closer to the camera and retake it.';
export const ENGINE_ERRORS = {
  error_no_face: FACE,
  photo_detection_fail: FACE,
  error_face_position_invalid: 'Your whole face needs to be inside the photo. Retake your selfie with your face fully in view.',
  error_face_position_too_small: SMALL,
  error_face_position_out_of_boundary: 'Your face is too close to the edge of the photo. Step back a little and retake it.',
  error_face_angle_invalid: 'Your face is turned too far. Face the camera, or turn clearly to the side, and retake your selfie.',
  error_face_parsing: FACE,
  error_pose: 'We could not see your pose. Use an upright, full-length photo of you facing the camera.',
  error_invalid_src: 'The full-length photo shows only part of you. Use a photo that shows you from head to toe.',
  error_multi_person: 'More than one person is in the photo. Use a photo with only you in it.',
  error_apply_region_mismatch: 'This outfit does not match the area of your photo it would cover. Try another outfit.',
  error_invalid_ref: 'YouCam could not use this product photo. Try another item.',
  object_detection_fail: 'YouCam could not find the product in its photo. Try another item.',
  error_nsfw_content_detected: 'YouCam blocked this result in its content check. Try another look.',
  error_below_min_image_size: 'Your photo is too small for this step. Use a larger photo.',
  error_exceed_max_image_size: 'Your photo is too large for this step. Use a smaller photo.',
  exceed_max_filesize: 'A photo is larger than YouCam accepts. Use a smaller photo.',
  error_download_image: 'YouCam could not download a photo. Try again.',
  photo_check_invalid: 'The pose or size of your photo is not suitable for this step. Retake it and try again.',
  input_error: 'YouCam did not accept a photo format. Use a JPG or PNG photo.',
  invalid_parameter: 'YouCam did not accept this item. Try another item.',
};

export function friendlyStageError(stage, err) {
  const code = String(err?.details?.code ?? err?.code ?? '');
  const mapped = ENGINE_ERRORS[code.toLowerCase()];
  const what = STAGE_BY_ID[stage]?.label?.toLowerCase() ?? 'this step';
  if (mapped) return { code: code || 'TASK_FAILED', message: mapped, retryable: !['error_nsfw_content_detected', 'error_invalid_ref', 'invalid_parameter'].includes(code.toLowerCase()) };
  switch (err?.code) {
    case 'SESSION_CAP': return { code: 'SESSION_CAP', message: 'You have used this session\'s unit allowance, so no more looks can be drawn. Looks already drawn stay available.', retryable: false };
    case 'GLOBAL_CAP': return { code: 'GLOBAL_CAP', message: 'The daily unit allowance for this demo has been reached. Looks already drawn stay available. Try again tomorrow.', retryable: false };
    case 'RATE_LIMITED': return { code: 'RATE_LIMITED', message: 'YouCam is busy right now. Wait a moment and try again. Nothing was charged.', retryable: true };
    case 'TASK_TIMEOUT': return { code: 'TASK_TIMEOUT', message: `Drawing the ${what} took too long. Nothing was charged. Try again.`, retryable: true };
    case 'YOUCAM_AUTH': return { code: 'YOUCAM_AUTH', message: 'The server could not sign in to YouCam. This is a problem on our side.', retryable: false };
    case 'ITEM_IMAGE_UNUSABLE': return { code: 'ITEM_IMAGE_UNUSABLE', message: err.message, retryable: false };
    case 'STORAGE_NOT_CONFIGURED': return { code: 'STORAGE_NOT_CONFIGURED', message: 'Image storage is not set up on the server yet.', retryable: false };
    default:
      return { code: err?.code ?? 'RENDER_FAILED', message: `We could not draw the ${what}. Nothing was charged. Try again.`, retryable: true };
  }
}

export const publicRenderConfig = ({ stages }) => ({
  label: AI_LABEL,
  maxLooks: LIMITS.maxLooksPerSession,
  shareTtlHours: LIMITS.shareTtlHours,
  stages,
});
