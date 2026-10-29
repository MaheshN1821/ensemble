import multer from 'multer';
import { AppError } from '../lib/errors.js';
import { LIMITS } from '../config/catalog.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.maxFileBytes, files: 1, fieldSize: LIMITS.maxFileBytes } });

/** Reads one catalog file from the "file" field. Multer's errors speak about a catalog file rather than a photo. */
export const uploadFile = (req, res, next) =>
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError('INVALID_FILE', `The file is larger than ${LIMITS.maxFileBytes / 1024} KB. Split it into smaller files.`, 413));
    if (err.code === 'LIMIT_UNEXPECTED_FILE') return next(new AppError('NO_FILE', 'Send one CSV or JSON file in the "file" field.', 400));
    return next(err);
  });

/** The text and format of an uploaded file, or of pasted content. */
export const fileInput = (req) => {
  const content = req.file ? req.file.buffer.toString('utf8') : typeof req.body?.content === 'string' ? req.body.content : null;
  if (content === null) throw new AppError('NO_FILE', 'Choose a CSV or JSON file to import, or paste its contents.', 400);
  const name = req.file?.originalname?.toLowerCase() ?? '';
  const format = req.body?.format || (name.endsWith('.json') ? 'json' : name.endsWith('.csv') ? 'csv' : undefined);
  return { content, format, fileName: req.file?.originalname ?? '' };
};
