'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const path = require('path');

const passport = require('./config/passport');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ─── Trust proxy ─────────────────────────────────────────────────────────────
// Trust the immediate upstream proxy only (e.g. Nginx, AWS ALB).
// Using `1` instead of `true` avoids express-rate-limit's permissive-proxy warning.
app.set('trust proxy', 1);

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:8000,http://localhost:5173,http://localhost:5174,https://admin.bimera.co/login,https://access.bimera.co'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const isOriginAllowed = (origin) => {
  if (!origin) return true;

  if (allowedOrigins.includes(origin)) return true;

  try {
    const url = new URL(origin);
    // Allow localhost/127.0.0.1
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return true;
    }
    // Allow bimera.co domains and subdomains
    if (url.hostname === 'bimera.co' || url.hostname.endsWith('.bimera.co')) {
      return true;
    }
  } catch (e) {
    // Ignore invalid url parse
  }

  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// ─── Rate limit ──────────────────────────────────────────────────────────────
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  })
);

// ─── Body parser ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ─── Session ─────────────────────────────────────────────────────────────────
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS required in prod
      sameSite: 'lax',
      maxAge: 5 * 60 * 1000,
    },
  })
);

// ─── Passport ────────────────────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ─── Static files ────────────────────────────────────────────────────────────
app.use(
  '/thumbnails',
  express.static(
    path.join(__dirname, '..', '..', 'skylearn-platform', 'public')
  )
);
app.use(
  '/public',
  express.static(
    path.join(__dirname, '..', 'public')
  )
);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));

// ─── Error handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;