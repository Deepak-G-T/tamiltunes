import { registerPlugin } from '@capacitor/core';

/** Our own Android plugin (android/.../AppUpdaterPlugin.java). Only used inside the app. Never resolve a promise with this object (see CLAUDE.md). */
export const AppUpdater = registerPlugin('AppUpdater');
