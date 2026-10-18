import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const boolOn = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');

const num = (def, min = 0) => z.coerce.number().min(min).default(def);

const feature = (def) => z.string().trim().min(1).max(60).regex(/^[a-z0-9][a-z0-9/_-]*$/i, 'must be a YouCam feature path such as cloth-v4').default(def);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(8080),
  LOG_LEVEL: z.string().default('info'),
  CLIENT_ORIGINS: z.string().default('http://localhost:5173'),
  // Public address of the client. Sample catalog images are served from there, so the server needs it to fetch them at render time.
  PUBLIC_CLIENT_URL: z.string().url().optional(),
  CATALOG_TTL_DAYS: num(30, 1),
  CATALOG_IMPORTS_PER_HOUR: num(12, 1),

  MONGODB_URI: z.string().min(1, 'is required'),

  YOUCAM_API_KEY: z.string().min(1, 'is required'),
  YOUCAM_BASE_URL: z.string().url().default('https://yce-api-01.makeupar.com'),
  YOUCAM_RATE_PER_SECOND: num(4, 1),
  YOUCAM_RATE_PER_WINDOW: num(230, 1),
  YOUCAM_WINDOW_SECONDS: num(300, 1),
  YOUCAM_CONCURRENCY: z.coerce.number().int().min(1).default(3),
  YOUCAM_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  YOUCAM_TASK_TIMEOUT_MS: z.coerce.number().int().min(5000).default(120000),
  YOUCAM_UNIT_OVERRIDES: z.string().optional(),
  UNKNOWN_FEATURE_UNITS: num(5, 0),
  // Render pipeline (Stage 6). Feature paths are the part after /s2s/v2.0/task/ in the YouCam docs.
  YOUCAM_FEATURE_CLOTHES: feature('cloth-v4'),
  YOUCAM_FEATURE_EARRINGS: feature('2d-vto/earring'),
  YOUCAM_FEATURE_NECKLACE: feature('2d-vto/necklace'),
  YOUCAM_FEATURE_MAKEUP: feature('makeup-vto'),
  // The docs describe the jewellery payload two ways. The server tries the others on a 400 and remembers what worked.
  YOUCAM_2D_VTO_STYLE: z.enum(['files', 'info', 'both']).default('files'),
  RENDER_DELETE_TASKS: boolOn,
  SESSION_RENDER_CAP: num(30, 1),
  // Signs expiring share links. Without it a random secret is made at boot and links stop working after a restart.
  SHARE_SECRET: z.string().min(16, 'must be at least 16 characters').optional(),

  SESSION_TTL_HOURS: num(24, 1),
  SESSION_UNIT_CAP: num(120, 1),
  GLOBAL_DAILY_UNIT_CAP: num(900, 1),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  ENABLE_DEV_ROUTES: bool,
});

function parseOverrides(raw) {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    /* fall through */
  }
  throw new Error('Invalid environment:\n  - YOUCAM_UNIT_OVERRIDES: must be a JSON object, e.g. {"skin-tone-analysis":1}');
}

export function loadEnv(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    isProd: e.NODE_ENV === 'production',
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    clientOrigins: e.CLIENT_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    publicClientUrl: e.PUBLIC_CLIENT_URL || e.CLIENT_ORIGINS.split(',')[0].trim(),
    catalogTtlDays: e.CATALOG_TTL_DAYS,
    catalogImportsPerHour: e.CATALOG_IMPORTS_PER_HOUR,
    mongoUri: e.MONGODB_URI,
    youcam: {
      apiKey: e.YOUCAM_API_KEY,
      baseUrl: e.YOUCAM_BASE_URL,
      ratePerSecond: e.YOUCAM_RATE_PER_SECOND,
      ratePerWindow: e.YOUCAM_RATE_PER_WINDOW,
      windowSeconds: e.YOUCAM_WINDOW_SECONDS,
      concurrency: e.YOUCAM_CONCURRENCY,
      pollIntervalMs: e.YOUCAM_POLL_INTERVAL_MS,
      taskTimeoutMs: e.YOUCAM_TASK_TIMEOUT_MS,
      unitOverrides: parseOverrides(e.YOUCAM_UNIT_OVERRIDES),
      unknownFeatureUnits: e.UNKNOWN_FEATURE_UNITS,
    },
    render: {
      features: { outfit: e.YOUCAM_FEATURE_CLOTHES, earrings: e.YOUCAM_FEATURE_EARRINGS, necklace: e.YOUCAM_FEATURE_NECKLACE, lipstick: e.YOUCAM_FEATURE_MAKEUP },
      vtoStyle: e.YOUCAM_2D_VTO_STYLE,
      deleteTasks: e.RENDER_DELETE_TASKS,
      sessionRenderCap: e.SESSION_RENDER_CAP,
    },
    shareSecret: e.SHARE_SECRET || null,
    sessionTtlHours: e.SESSION_TTL_HOURS,
    sessionUnitCap: e.SESSION_UNIT_CAP,
    globalDailyUnitCap: e.GLOBAL_DAILY_UNIT_CAP,
    cloudinary: {
      cloudName: e.CLOUDINARY_CLOUD_NAME || '',
      apiKey: e.CLOUDINARY_API_KEY || '',
      apiSecret: e.CLOUDINARY_API_SECRET || '',
    },
    enableDevRoutes: e.ENABLE_DEV_ROUTES,
  };
}
