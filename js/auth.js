/* ============================================================
   UMRANIGPT — Auth Guard
   Shared session-check logic for index.html and admin.html.
   Runs before the rest of the app boots so an unauthenticated
   visitor never sees a flash of the app UI.
============================================================ */
'use strict';

window.AppAuth = (() => {

  let currentUser = null;

  const getCurrentUser = () => currentUser;

  const RESET_ACK_KEY = 'umrani_reset_ack';

  /* If an admin has reset this user's conversations since we last
     checked, clear local chat history once and remember we did. */
  const applyPendingReset = (user) => {
    if (!user.resetConversationsAt) return;
    const lastAck = Number(localStorage.getItem(RESET_ACK_KEY) || 0);
    if (user.resetConversationsAt > lastAck) {
      try {
        window.AppStorage?.setChats({});
        window.AppStorage?.setCurrentChatId(null);
      } catch { /* storage module may not be loaded on every page */ }
      localStorage.setItem(RESET_ACK_KEY, String(user.resetConversationsAt));
    }
  };

  /* Redirects to login.html unless a valid session exists.
     Resolves with the user object when the caller may proceed. */
  const guardUser = async () => {
    try {
      const { user } = await window.AppApi.me();
      currentUser = user;
      applyPendingReset(user);
      return user;
    } catch {
      window.location.replace('login.html');
      return null;
    }
  };

  /* Same as guardUser, but additionally requires role === 'admin'.
     A logged-in non-admin is sent back to the normal app rather
     than to login — they *are* authenticated, just not authorised. */
  const guardAdmin = async () => {
    try {
      const { user } = await window.AppApi.me();
      currentUser = user;
      if (user.role !== 'admin') {
        window.location.replace('index.html');
        return null;
      }
      return user;
    } catch {
      window.location.replace('login.html');
      return null;
    }
  };

  const logout = async () => {
    try { await window.AppApi.logout(); } catch { /* proceed to redirect regardless */ }
    window.location.replace('login.html');
  };

  return { guardUser, guardAdmin, logout, getCurrentUser };
})();
