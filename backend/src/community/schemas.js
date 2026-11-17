import { z } from 'zod';
import { sanitizeText, charLength } from './sanitize.js';

export const COMMENT_MAX = 500;
export const BIO_MAX = 150;

const clean = (max, { multiline = true, min = 0 } = {}) =>
  z.string().transform((s) => sanitizeText(s, { multiline })).refine((s) => charLength(s) >= min, { message: min ? 'Required' : '' })
    .refine((s) => charLength(s) <= max, { message: `Must be at most ${max} characters` });

export const commentCreateSchema = z.object({
  body: clean(COMMENT_MAX, { min: 1 }),
  parentId: z.string().min(1).max(64).optional().nullable(),
  timestampSec: z.number().int().min(0).max(86400).optional().nullable(),
});

export const commentEditSchema = z.object({ body: clean(COMMENT_MAX, { min: 1 }) });

export const reportSchema = z.object({
  reason: z.enum(['spam', 'abuse', 'hate', 'sexual', 'other']),
});

export const commentListQuery = z.object({
  sort: z.enum(['newest', 'top']).default('newest'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
  since: z.string().datetime().optional(),
});

export const profileUpdateSchema = z.object({
  name: clean(50, { multiline: false, min: 1 }).optional(),
  username: z.string().max(40).optional(),
  bio: clean(BIO_MAX).optional().nullable(),
  location: clean(60, { multiline: false }).optional().nullable(),
  genres: z.array(clean(30, { multiline: false, min: 1 })).max(10).optional(),
  favoriteArtists: z.array(clean(60, { multiline: false, min: 1 })).max(10).optional(),
  language: z.enum(['ta', 'en', 'hi', 'te', 'ml', 'kn']).optional().nullable(),
  isPublicProfile: z.boolean().optional(),
  showHistory: z.boolean().optional(),
  avatar: z.string().max(120000).optional().nullable(),
}).strict();

export const playlistUpdateSchema = z.object({
  name: clean(80, { multiline: false, min: 1 }).optional(),
  description: clean(300).optional().nullable(),
  isPublic: z.boolean().optional(),
}).strict();

export const deleteAccountSchema = z.object({ password: z.string().min(1).max(200) });
