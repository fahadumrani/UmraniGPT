/* ============================================================
   UMRANIGPT — Configuration
   All user-facing settings are below.
   Edit this file to customise the application.
   Changes take effect after saving and reloading the page.
============================================================ */
'use strict';

window.AppConfig = Object.freeze({
  APP_NAME: 'UmraniGPT',
  VERSION:  '1.0.0',
  AUTHOR:   'UmraniGPT',

  /* ==========================================================
     AI GENERATION SETTINGS
     Edit these values to change how the AI responds.
  ========================================================== */
  AI: {
    TEMPERATURE:    0.7,    // Creativity / randomness  (0.0 – 2.0)
    TOP_P:          0.9,    // Nucleus sampling          (0.0 – 1.0)
    TOP_K:          40,     // Token pool limit          (1 – 100)
    REPEAT_PENALTY: 1.1,    // Penalise repetition       (1.0 – 2.0)
    CONTEXT_LENGTH: 4096,   // Max context tokens        (512 – 131072)
    SEED:           -1,     // -1 = random, fixed for reproducibility
    STREAMING:      true,   // Stream tokens as generated
    SYSTEM_PROMPT:  '',     // System instruction (leave '' for none)
  },

  /* ==========================================================
     UI DEFAULTS
  ========================================================== */
  DEFAULT_THEME:      'dark',
  DEFAULT_FONT_SIZE:  15,
  DEFAULT_ANIMATIONS: true,
  DEFAULT_TIMESTAMPS: true,
  DEFAULT_LINE_NUMS:  true,
  DEFAULT_SIDEBAR:    true,

  /* Voice defaults */
  DEFAULT_VOICE_SPEED:  1.0,
  DEFAULT_VOICE_PITCH:  1.0,
  DEFAULT_VOICE_VOLUME: 1.0,
  DEFAULT_VOICE_NAME:   '',
  DEFAULT_LANGUAGE:     'en',

  /* ==========================================================
     LIMITS (do not change unless you know what you're doing)
  ========================================================== */
  MAX_HISTORY_ITEMS:  2000,
  MAX_FILE_SIZE_MB:   10,
  SIDEBAR_MIN_WIDTH:  180,
  SIDEBAR_MAX_WIDTH:  400,

  /* Timings (ms) */
  CONNECTION_TIMEOUT:     10000,
  RECONNECT_INTERVAL:     5000,
  DEBOUNCE_DELAY:         300,
  THROTTLE_DELAY:         100,
  TOAST_DURATION:         3500,
  LATENCY_CHECK_INTERVAL: 30000,

  /* Storage keys */
  STORAGE: {
    SETTINGS:     'umrani_settings',
    CHATS:        'umrani_chats',
    CURRENT_CHAT: 'umrani_current_chat',
    SIDEBAR_WIDTH:'umrani_sidebar_width',
    SIDEBAR_OPEN: 'umrani_sidebar_open',
    FOLDERS:      'umrani_folders',
    PINNED:       'umrani_pinned',
    FAVORITES:    'umrani_favorites',
  },

  /* Supported file types */
  SUPPORTED_FILES: {
    text:     ['txt','md','markdown','csv','json','xml','html','htm','yaml','yml','log'],
    image:    ['png','jpg','jpeg','gif','webp','bmp','svg'],
    document: ['pdf','docx','doc'],
    archive:  ['zip'],
    code:     ['js','ts','py','java','c','cpp','cs','go','rs','php','rb','sh','sql'],
  },

  /* Themes */
  THEMES: ['dark','light','oled','cyber','blue','purple','green','glass'],

  /* API endpoints */
  ENDPOINTS: {
    TAGS:     '/api/tags',
    CHAT:     '/api/chat',
    GENERATE: '/api/generate',
    SHOW:     '/api/show',
    EMBED:    '/api/embed',
    PS:       '/api/ps',
  },

  /* Welcome screen suggestion cards */
  SUGGESTIONS: [
    { icon:'fa-code',             title:'Write Code',          desc:'Get help writing, reviewing, or debugging code in any language' },
    { icon:'fa-pen-fancy',        title:'Creative Writing',    desc:'Stories, essays, poems and more with your creative assistant' },
    { icon:'fa-magnifying-glass', title:'Research & Analysis', desc:'Analyse data, summarise documents, explore complex topics' },
    { icon:'fa-robot',            title:'Brainstorm Ideas',    desc:'Generate ideas, explore concepts, think through problems together' },
  ],

  /* Reaction emojis */
  REACTIONS: ['👍','❤️','😂','🤔','🔥','👎'],
});
