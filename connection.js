/* ============================================================
   UmraniGPT — Connection Settings
   Sirf YAHAN URLs aur Keys add karein.
   Baaki kisi file ko CHHOONA nahi parta.
   ============================================================

   SETUP STEPS:
   1. Backend (server/) chal raha ho: npm start
   2. BACKEND_URL mein apna backend address daalen
   3. Agar Cloudflare Tunnel use kar rahe ho to tunnel URL daalen
   4. Local testing ke liye http://localhost:3001 hi rakho

   ============================================================ */

window.UMRANI_CONFIG = {

  /* ---- Backend Server URL ----
     Yahan apna backend URL daalen.
     Local:           http://localhost:3001
     Cloudflare Tunnel: https://xxxx-xxxx.trycloudflare.com
     Custom domain:   https://api.yourdomain.com             */
  BACKEND_URL: 'https://indicate-modems-variance-controllers.trycloudflare.com    ',

  /* ---- Google OAuth ---- (optional)
     Google Cloud Console se milega:
     https://console.cloud.google.com/apis/credentials
     Blank chhoren agar use nahi karna                       */
  GOOGLE_CLIENT_ID: '',

  /* ---- Facebook OAuth ---- (optional)
     Meta Developer Console se milega:
     https://developers.facebook.com/apps
     Blank chhoren agar use nahi karna                       */
  FACEBOOK_APP_ID: '',

};

/* ============================================================
   YAHAN SE NEECHE KUCH MAT BADLEIN
   ============================================================ */
window.UMRANI_API_URL = (window.UMRANI_CONFIG.BACKEND_URL || '').trim().replace(/\/+$/, '');
