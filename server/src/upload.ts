import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { config } from './config.js';

const allowedMimePrefixes = ['image/', 'video/', 'audio/'];

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadMb * 1024 * 1024
  },
  fileFilter(_request, file, callback) {
    if (allowedMimePrefixes.some((prefix) => file.mimetype.startsWith(prefix))) {
      callback(null, true);
      return;
    }

    callback(new Error('Only image, video, and audio files are allowed.'));
  }
});

const extensionByMime: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.webm'
};

export function saveUploadedMedia(file: Express.Multer.File) {
  const extension = extensionByMime[file.mimetype] ?? '.bin';
  const datePath = new Date().toISOString().slice(0, 10).replaceAll('-', '/');
  const relativeDir = path.join(datePath, randomUUID());
  const targetDir = path.join(config.uploadsDir, relativeDir);
  const filename = `media${extension}`;

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, filename), file.buffer);

  return `/uploads/${relativeDir.replaceAll(path.sep, '/')}/${filename}`;
}
