import app from '../backend/src/app.js';
import { initDb } from '../backend/src/prisma/client.js';

let isDbInitialized = false;

export default async function handler(req, res) {
  if (!isDbInitialized) {
    try {
      await initDb();
      isDbInitialized = true;
    } catch (err) {
      console.warn('Vercel serverless DB init warning:', err.message);
    }
  }
  return app(req, res);
}
