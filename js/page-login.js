/* ============================================================
   UMRANIGPT — Login Page Logic
============================================================ */
'use strict';

(() => {
  const form            = document.getElementById('login-form');
  const emailInput      = document.getElementById('login-email');
  const passwordInput   = document.getElementById('login-password');
  const rememberInput   = document.getElementById('login-remember');
  const submitBtn       = document.getElementById('login-submit');
  const messageBox      = document.getElementById('auth-message');
  const toggleVisBtn    = document.getElementById('login-toggle-visibility');
  const googleBtn       = document.getElementById('oauth-google-btn');
  const facebookBtn     = document.getElementById('oauth-facebook-btn');

  /* ---- OAuth error messages from URL params ---- */
  const OAUTH_ERRORS = {
    access_denied:       'Sign-in was cancelled.',
    invalid_state:       'That sign-in link expired. Please try again.',
    sign_in_failed:      'Could not complete sign-in. Please try again.',
    not_configured:      'Google / Facebook sign-in is not configured on this server yet. Use email & password instead.',
    server_not_configured: 'Social sign-in is not configured on this server yet.',
  };

  /* ---- Always set the OAuth URLs ---- */
  /* Buttons are ALWAYS visible by default — they only redirect when clicked.
     If credentials aren't configured, the backend returns ?error=not_configured
     which is shown as a clear message. Never hide buttons based on a network call. */
  const setupOAuthButtons = () => {
    if (googleBtn)   googleBtn.href   = window.AppApi.oauthUrl('google');
    if (facebookBtn) facebookBtn.href = window.AppApi.oauthUrl('facebook');
  };

  const showOAuthErrorIfAny = () => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) showMessage(OAUTH_ERRORS[error] || 'Sign-in failed. Please try again.');
    // Clean up the URL so a refresh doesn't re-show the error
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
    toggleVisBtn.setAttribute('aria-pressed', String(isPassword));
    toggleVisBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    toggleVisBtn.innerHTML = isPassword
      ? '<i class="fa-regular fa-eye-slash" aria-hidden="true"></i>'
      : '<i class="fa-regular fa-eye" aria-hidden="true"></i>';
  });

  /* ---- Email/password submit ---- */
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();

    const email    = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showMessage('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      await window.AppApi.login(email, password, rememberInput.checked);
      showMessage('Signed in — redirecting…', 'success');
      window.location.replace('index.html');
    } catch (err) {
      showMessage(err.message || 'Unable to sign in. Please try again.');
      setLoading(false);
    }
  });

  /* ---- Init ---- */
  const init = async () => {
    if (window.AppTheme) window.AppTheme.init();

    setupOAuthButtons();
    showOAuthErrorIfAny();

    // Auto-login: already authenticated → skip login page
    try {
      await window.AppApi.me();
      window.location.replace('index.html');
    } catch {
      emailInput.focus();
    }
  };

  init();
})();
