/* ============================================================
   UMRANIGPT SERVER — Language Detector
   Detects English / Urdu (script) / Roman Urdu from a text
   sample. Used to append a reply-language instruction to the
   system prompt automatically — the AI replies in the same
   language the user writes in, without the user having to ask.
   No external library — pure regex + heuristics.
============================================================ */
'use strict';

/* Unicode ranges */
const URDU_RANGE   = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_RANGE  = /[a-zA-Z]/;

/* Common Roman-Urdu tokens — words that appear in Roman Urdu
   but rarely in standard English. We check for a minimum
   concentration rather than presence alone to avoid false
   positives on English sentences that happen to contain one
   Urdu word. */
const ROMAN_URDU_TOKENS = new Set([
  'kya', 'hai', 'nahi', 'hain', 'hy', 'tha', 'thi', 'the',
  'mein', 'main', 'aap', 'tum', 'hum', 'yeh', 'yeh', 'woh',
  'aur', 'se', 'ko', 'ke', 'ka', 'ki', 'ne', 'bhi', 'bas',
  'agar', 'toh', 'lekin', 'magar', 'phir', 'ab', 'abhi',
  'theek', 'sahi', 'galat', 'karo', 'karna', 'karta', 'karti',
  'bolna', 'bolo', 'baat', 'kuch', 'koi', 'sab', 'sirf',
  'bahut', 'thoda', 'zyada', 'kam', 'achha', 'bura', 'acha',
  'liye', 'wala', 'wali', 'wale', 'likho', 'batao', 'btao',
  'samajh', 'pata', 'maloom', 'zaroor', 'shayad', 'hoga',
  'chal', 'kar', 'dena', 'lena', 'jana', 'aana', 'chahiye',
  'karein', 'karoon', 'karonga', 'karunga', 'chahta', 'chahti',
]);

const CONFIDENCE_THRESHOLD = 0.12; // 12% Roman Urdu token concentration

/**
 * Detect the dominant language of a text sample.
 * @param {string} text
 * @returns {'urdu' | 'roman_urdu' | 'english'}
 */
const detect = (text) => {
  if (!text || typeof text !== 'string') return 'english';

  const sample = text.toLowerCase().slice(0, 800);

  // 1. Script-level detection: if Urdu Unicode chars are present → native Urdu
  const urduCharCount  = (sample.match(/[\u0600-\u06FF]/g) || []).length;
  const totalCharCount = sample.replace(/\s/g, '').length || 1;
  if (urduCharCount / totalCharCount > 0.08) return 'urdu';

  // 2. Token-level detection for Roman Urdu
  const words      = sample.split(/[\s.,!?;:،؟]+/).filter(Boolean);
  if (words.length < 3) return 'english'; // too short to classify
  const romanUrduCount = words.filter(w => ROMAN_URDU_TOKENS.has(w)).length;
  if (romanUrduCount / words.length >= CONFIDENCE_THRESHOLD) return 'roman_urdu';

  return 'english';
};

/**
 * Build a short language instruction that goes in the system prompt.
 * The AI should reply in the same language as the user without being
 * explicitly told to every time — having this in the system prompt
 * means it just happens silently.
 */
const buildLanguageInstruction = (lang) => {
  switch (lang) {
    case 'urdu':
      return 'User ne Urdu (nastaliq script) mein likha hai. Jawab zaroor Urdu script mein dein, jab tak user kuch aur na kahe.';
    case 'roman_urdu':
      return 'User Roman Urdu mein likh raha hai. Jawab Roman Urdu mein dena (Urdu words written in Latin letters), unless the user asks otherwise.';
    default:
      return ''; // English — no instruction needed, it is the model's default
  }
};

module.exports = { detect, buildLanguageInstruction };
