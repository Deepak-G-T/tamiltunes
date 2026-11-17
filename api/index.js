import app from '../backend/src/app.js';
import { initDb } from '../backend/src/prisma/client.js';

let isDbInitialized = false;

export default async function handler(req, res) {
  if (!isDbInitialized) {
    try {
      await initDb();
      isDbInitialized = true;
    } catch (err) {
      console.error('Vercel serverless DB init failed:', err.message);
      return res.status(503).json({ success: false, message: 'Service unavailable' });
    }
  }
  return app(req, res);
}
