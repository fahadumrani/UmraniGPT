/* ============================================================
   UMRANIGPT — Signup Page Logic
============================================================ */
'use strict';

(() => {
  const form          = document.getElementById('signup-form');
  const emailInput    = document.getElementById('signup-email');
  const passwordInput = document.getElementById('signup-password');
  const confirmInput  = document.getElementById('signup-confirm');
  const submitBtn     = document.getElementById('signup-submit');
  const messageBox    = document.getElementById('auth-message');
  const toggleVisBtn  = document.getElementById('signup-toggle-visibility');
  const googleBtn     = document.getElementById('oauth-google-btn');
  const facebookBtn   = document.getElementById('oauth-facebook-btn');

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---- OAuth error messages from URL params ---- */
  const OAUTH_ERRORS = {
    access_denied:         'Sign-in was cancelled.',
    invalid_state:         'That sign-in link expired. Please try again.',
    sign_in_failed:        'Could not complete sign-in. Please try again.',
    not_configured:        'Google / Facebook sign-in is not configured on this server yet. Use email & password instead.',
    server_not_configured: 'Social sign-in is not configured on this server yet.',
  };

  /* ---- Always set OAuth URLs (buttons always visible) ---- */
  const setupOAuthButtons = () => {
    if (googleBtn)   googleBtn.href   = window.AppApi.oauthUrl('google');
    if (facebookBtn) facebookBtn.href = window.AppApi.oauthUrl('facebook');
  };

  const showOAuthErrorIfAny = () => {
    const params = new URLSearchParams(window.location.search);
    const error  = params.get('error');
    if (error) showMessage(OAUTH_ERRORS[error] || 'Sign-in failed. Please try again.');
    if (error && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  /* ---- UI helpers ---- */
  const showMessage = (text, type = 'error') => {
    messageBox.textContent = text;
    messageBox.className = `auth-message is-visible is-${type}`;
  };

  const clearMessage = () => {
    messageBox.textContent = '';
    messageBox.className = 'auth-message';
  };

  const setLoading = (loading) => {
    submitBtn.disabled = loading;
    submitBtn.classList.toggle('is-loading', loading);
  };

  /* ---- Password visibility toggle ---- */
  toggleVisBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    confirmInput.type  = isPassword ? 'text' : 'password';
    toggleVisBtn.setAttribute('aria-pressed', String(isPassword));
    toggleVisBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    toggleVisBtn.innerHTML = isPassword
      ? '<i class="fa-regular fa-eye-slash" aria-hidden="true"></i>'
      : '<i class="fa-regular fa-eye" aria-hidden="true"></i>';
  });

  /* ---- Signup submit ---- */
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();

    const email    = emailInput.value.trim();
    const password = passwordInput.value;
    const confirm  = confirmInput.value;

    if (!EMAIL_RE.test(email)) {
      showMessage('Please enter a valid email address.');
      emailInput.focus();
      return;
    }
    if (password.length < 8) {
      showMessage('Password must be at least 8 characters.');
      passwordInput.focus();
      return;
    }
    if (password !== confirm) {
      showMessage('Passwords do not match.');
      confirmInput.focus();
      return;
    }

    setLoading(true);
    try {
      await window.AppApi.signup(email, password);
      showMessage('Account created — redirecting…', 'success');
      window.location.replace('index.html');
    } catch (err) {
      showMessage(err.message || 'Unable to create your account. Please try again.');
      setLoading(false);
    }
  });

  /* ---- Init ---- */
  const init = async () => {
    if (window.AppTheme) window.AppTheme.init();

    setupOAuthButtons();
    showOAuthErrorIfAny();

    // Auto-login: already authenticated → skip signup page
    try {
      await window.AppApi.me();
      window.location.replace('index.html');
    } catch {
      emailInput.focus();
    }
  };

  init();
})();
