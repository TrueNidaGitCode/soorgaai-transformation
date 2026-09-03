/**
 * Defect Matching Agent — server entrypoint
 *
 * Retrieval-Augmented Semantic Matching for Defects. See README.md for
 * setup, seeding, and deployment steps.
 */

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

import defectMatchingRoutes from './routes/defectMatchingRoutes.js';
import jiraRoutes from './routes/jiraRoutes.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const APP_NAME = process.env.APP_NAME || 'AI Assistant';

app.use(express.json());
app.use(cors({
  origin: [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
}));

/**
 * The application itself. The UI lives in frontend/ and used to sit in the
 * repository unserved, so opening the address returned a JSON banner instead
 * of the product — the API was running, but nothing was using it.
 */
app.use(express.static(path.join(__dirname, 'frontend')));

/** Health/version, where a machine looks for it rather than at the front door. */
app.get('/api', (req, res) => {
  res.json({ name: APP_NAME, status: 'running', version: '1.0.0' });
});

/**
 * A browser session for the chat UI.
 *
 * Off unless APP_PUBLIC_ACCESS is set. Hosted deployments turn it on so the
 * application simply works when its address is opened; a customer running
 * this themselves leaves it off and puts their own sign-in in front, which
 * is why it is opt-in rather than the default.
 */
app.post('/api/session', (req, res) => {
  if (process.env.APP_PUBLIC_ACCESS !== 'true') {
    return res.status(403).json({ error: 'Public access is disabled for this deployment.' });
  }
  const token = jwt.sign(
    { userId: 'public-session', role: 'user' },
    process.env.JWT_SECRET || 'your_secret_key',
    { expiresIn: '12h' }
  );
  res.json({ token, appName: APP_NAME });
});

app.use('/api/defect-matching', defectMatchingRoutes);
app.use('/api/jira', jiraRoutes); // optional — see JIRA_INTEGRATION.md

// Anything else is the single-page app.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

async function start() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing — copy .env.example to .env and fill it in.');
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');
  app.listen(PORT, () => console.log(`Defect Matching Agent listening on port ${PORT}`));
}

start().catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});
