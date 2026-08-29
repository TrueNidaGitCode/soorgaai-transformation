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

import defectMatchingRoutes from './routes/defectMatchingRoutes.js';
import jiraRoutes from './routes/jiraRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors({
  origin: [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
}));

app.get('/', (req, res) => {
  res.json({ message: 'Defect Matching Agent — API is running', version: '1.0.0' });
});

app.use('/api/defect-matching', defectMatchingRoutes);
app.use('/api/jira', jiraRoutes); // optional — see JIRA_INTEGRATION.md

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
