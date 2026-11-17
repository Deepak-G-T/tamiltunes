/**
 * Blocklists. Keep entries lower-case, one lemma each.
 *
 * NEEDS NATIVE REVIEW: the Tamil lists are a conservative starter set (common
 * slurs only). Tamil words that are harmless in some contexts are deliberately
 * left out to avoid false positives on song lyrics. Add terms here, not in logic.
 */
export const ENGLISH_BLOCKLIST = [
  'fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bitch', 'bastard', 'asshole',
  'dick', 'pussy', 'slut', 'whore', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'rape',
];

// Romanised Tamil/Hindi-Tamil street slang commonly used in comments.
export const TAMIL_ROMANIZED_BLOCKLIST = [
  'otha', 'ootha', 'thevidiya', 'thevdiya', 'punda', 'pundai', 'sunni', 'koothi', 'kuthi',
  'okka', 'oombu', 'gommala', 'lavada', 'myre', 'mayiru', 'naaye', 'sool',
];

// Tamil script.
export const TAMIL_BLOCKLIST = [
  'ஓத்தா', 'ஒத்தா', 'தேவடியா', 'தேவிடியா', 'புண்டை', 'சுன்னி', 'கூதி', 'ஓம்பு', 'ஊம்பு', 'மயிரு', 'கொம்மாள',
];
