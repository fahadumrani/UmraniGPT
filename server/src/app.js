/* ============================================================
   UMRANIGPT SERVER — Express App
============================================================ */
'use strict';

const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');

const { attachUser } = require('./middleware/auth');
const authRoutes   = require('./routes/auth');
const oauthRoutes  = require('./routes/oauth');
const adminRoutes  = require('./routes/admin');
const chatRoutes   = require('./routes/chat');
const configRoutes = require('./routes/config');
const { logError } = require('./utils/logger');

const app = express();

const allowedOrigins = (process.env.FRONTEND_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.set('trust proxy', 1); // correct IP behind Cloudflare Tunnel

/* ---- Security headers ---- */
app.use(helmet({
  contentSecurityPolicy: false, // frontend loaded from a different origin
  crossOriginEmbedderPolicy: false,
}));

/* Remove fingerprinting headers */
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.removeHeader('Server');
  next();
});

/* ---- CORS — must be before all routes ---- */
const corsOptions = {
  origin(origin, callback) {
    // Allow same-origin requests (no Origin header) — e.g. curl, server-to-server
    if (!origin) return callback(null, true);

    // Exact match against the allowedOrigins list
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Reject — log the blocked origin to help with debugging
    console.warn(`[UmraniGPT] CORS blocked origin: ${origin}`);
    console.warn(`[UmraniGPT] Allowed: ${allowedOrigins.join(', ') || '(none set)'}`);
    console.warn(`[UmraniGPT] Add this to FRONTEND_ORIGINS in server/.env`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials:     true,                      // required for cross-origin cookies
  allowedHeaders:  ['Content-Type', 'X-API-Key'],
  exposedHeaders:  [],
  methods:         ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  preflightContinue: false,
  optionsSuccessStatus: 204,                  // some older browsers choke on 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));          // explicitly handle preflight for all routes

/* ---- Global rate-limit (all /api routes) ---- */
app.use('/api', rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 120,           // 120 reqs/min per IP — generous for a chat app
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  skip: (req) => {
    // Don't rate-limit health checks
    return req.path === '/api/health';
  },
}));

/* ---- Body parsing — strict size limits ---- */
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(attachUser);

/* ---- Input sanitisation middleware ----
   Strip null bytes and excessively long headers that could
   cause issues in logs or downstream processing. */
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    const sanitise = (obj, depth = 0) => {
      if (depth > 5) return obj;
      if (typeof obj === 'string') return obj.replace(/\0/g, '').slice(0, 100_000);
      if (Array.isArray(obj)) return obj.slice(0, 200).map(v => sanitise(v, depth + 1));
      if (obj && typeof obj === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(obj).slice(0, 50)) {
          out[k.replace(/\0/g, '')] = sanitise(v, depth + 1);
        }
        return out;
      }
      return obj;
    };
    req.body = sanitise(req.body);
  }
  next();
});

/* ---- Routes ---- */
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth',   authRoutes);
app.use('/api/auth',   oauthRoutes);
app.use('/api/admin',  adminRoutes);
app.use('/api/chat',   chatRoutes);
app.use('/api/config', configRoutes);

/* ---- 404 ---- */
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

/* ---- Global error handler — never leaks stack traces ---- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  logError('Unhandled request error', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
