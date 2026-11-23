import { z } from 'zod';
import { sanitizeText, charLength } from './sanitize.js';

export const BIO_MAX = 150;

const clean = (max, { multiline = true, min = 0 } = {}) =>
  z.string().transform((s) => sanitizeText(s, { multiline })).refine((s) => charLength(s) >= min, { message: min ? 'Required' : '' })
    .refine((s) => charLength(s) <= max, { message: `Must be at most ${max} characters` });

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

export const deleteAccountSchema = z.object({ password: z.string().max(200).optional(), confirmEmail: z.string().max(320).optional() });
