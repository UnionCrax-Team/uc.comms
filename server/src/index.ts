import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import http from 'node:http';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { config } from './config.js';
import { db, initializeDatabase, GENERAL_CHANNEL_ID } from './db.js';
import { apiRouter, setSocketIo } from './routes.js';
import { setupSocket } from './socket.js';

if (config.nodeEnv === 'production' && !config.sessionSecret) {
  throw new Error('SESSION_SECRET must be set in production.');
}

initializeDatabase();

const now = new Date().toISOString();
const users = db.prepare('SELECT id FROM users').all() as { id: string }[];
for (const user of users) {
  const existing = db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(GENERAL_CHANNEL_ID, user.id);
  if (!existing) {
    db.prepare('INSERT INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, ?)').run(GENERAL_CHANNEL_ID, user.id, now);
  }
}

const app = express();
const server = http.createServer(app);

app.set('trust proxy', config.trustProxy);

const allowedOrigins = new Set([
  config.appBaseUrl,
  'capacitor://localhost',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed'));
  },
  credentials: true
}));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'", 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://cdn.discordapp.com'],
        manifestSrc: ["'self'"],
        mediaSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    }
  })
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 180,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

app.use('/api', apiRouter);
app.use('/uploads', express.static(config.uploadsDir, { maxAge: '1y', immutable: true, fallthrough: false }));
app.use(express.static(config.publicDistDir, { index: false, maxAge: '5m' }));

app.get('*', (_request, response) => {
  response.sendFile(path.join(config.publicDistDir, 'index.html'));
});

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const payload = error as { code?: string; message?: string };

  if (payload.code === 'LIMIT_FILE_SIZE') {
    response.status(413).json({ error: `Uploaded media must be ${config.maxUploadMb}MB or smaller.` });
    return;
  }

  if (payload.message === 'Only image, video, and audio files are allowed.') {
    response.status(400).json({ error: payload.message });
    return;
  }

  console.error(error);
  response.status(500).json({ error: 'Something went wrong.' });
};

app.use(errorHandler);

const allowedSocketOrigins = new Set([config.appBaseUrl, 'capacitor://localhost', 'http://localhost:5173', 'http://127.0.0.1:5173']);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedSocketOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Socket origin is not allowed.'));
    },
    credentials: true
  }
});

setupSocket(io);
setSocketIo(io);

server.listen(config.port, () => {
  console.log(`UC Comms listening on ${config.appBaseUrl}`);
});

function ensureRuntimeDirectories() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

ensureRuntimeDirectories();
