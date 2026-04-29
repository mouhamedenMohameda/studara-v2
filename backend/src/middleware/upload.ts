import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
];

// ─── Magic byte signatures ────────────────────────────────────────────────────
// Checked against the actual saved file — cannot be spoofed via Content-Type header.
const MAGIC_SIGNATURES: { bytes: number[]; mask?: number[]; description: string }[] = [
  { bytes: [0x25, 0x50, 0x44, 0x46],                                       description: 'PDF'  },
  { bytes: [0x50, 0x4B, 0x03, 0x04],                                       description: 'ZIP-based (DOCX/PPTX/XLSX)' },
  { bytes: [0xFF, 0xD8, 0xFF],                                              description: 'JPEG' },
  { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],              description: 'PNG'  },
  { bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1],              description: 'OLE (DOC/PPT/XLS)' },
];

function detectMagicBytes(filePath: string): boolean {
  const HEADER_SIZE = 8;
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(HEADER_SIZE);
    const bytesRead = fs.readSync(fd, buf, 0, HEADER_SIZE, 0);
    if (bytesRead < 3) return false;

    return MAGIC_SIGNATURES.some(sig =>
      sig.bytes.every((b, i) => i < bytesRead && buf[i] === b),
    );
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Post-multer middleware: validates that the saved file's magic bytes
 * match a known safe format. Deletes the file and returns 415 if not.
 *
 * Usage: router.post('/upload', upload.single('file'), validateFileType, handler)
 */
export function validateFileType(req: Request, res: Response, next: NextFunction): void {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) { next(); return; }

  if (!detectMagicBytes(file.path)) {
    // Remove the already-saved file to avoid storing dangerous content
    fs.unlink(file.path, () => {});
    res.status(415).json({
      error: 'The uploaded file content does not match an allowed format (PDF, DOCX, PPTX, JPEG, PNG).',
    });
    return;
  }
  next();
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed. Use PDF, DOCX, PPTX, or images.'));
    }
  },
});
