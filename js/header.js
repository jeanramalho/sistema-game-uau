// js/header.js
// Comportamento do menu mobile (hamburger).
// Adiciona body.menu-open ao abrir menu (para esconder authBtn via CSS).
// Continua sincronizando nextSaturdayTag e propagando authBtn para mobile.

(function () {
  function debounce(fn, wait = 120) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        try { fn.apply(this, args); } catch (e) { console.error('debounce fn err', e); }
      }, wait);
    };
  }

  const hamburgerBtns = Array.from(document.querySelectorAll('#hamburgerBtn'));
  const mobileMenu = document.getElementById('mobileMenu');
  const mobilePanel = document.getElementById('mobilePanel');
  const mobileOverlay = document.getElementById('mobileOverlay');
  const menuCloseBtn = document.getElementById('menuCloseBtn');

  const authBtnDesktop = () => document.getElementById('authBtn');
  const authBtnMobile = () => document.getElementById('authBtnMobile');

  const nextDesktopEl = () => document.getElementById('nextSaturdayTag');
  const nextMobileEl = () => document.getElementById('nextSaturdayTagMobile');

  function openMenu() {
    if (!mobileMenu || !mobilePanel) return;
    mobileMenu.classList.remove('hidden');
    requestAnimationFrame(() => {
      mobilePanel.style.transform = 'translateX(0)';
      mobilePanel.style.transition = 'transform 220ms ease-out';
    });
    setTimeout(() => {
      const focusable = mobilePanel.querySelector('button, a, [tabindex]:not([tabindex="-1"])');
      if (focusable) focusable.focus();
    }, 140);

    // add body class to hide desktop auth with CSS (reliable)
    try { document.body.classList.add('menu-open'); } catch (e) {}

    propagateAuthStateToMobile();
    syncNextTagText();
  }

  function closeMenu() {
    if (!mobileMenu || !mobilePanel) return;
    mobilePanel.style.transform = 'translateX(100%)';
    mobilePanel.style.transition = 'transform 180ms ease-in';
    setTimeout(() => {
      if (mobileMenu) mobileMenu.classList.add('hidden');
      // remove body class so desktop auth reappears
      try { document.body.classList.remove('menu-open'); } catch (e) {}
    }, 220);
  }

  function toggleMenu() {
    if (!mobileMenu) return;
    if (mobileMenu.classList.contains('hidden')) openMenu(); else closeMenu();
  }

  hamburgerBtns.forEach(b => b && b.addEventListener('click', toggleMenu));
  if (mobileOverlay) mobileOverlay.addEventListener('click', closeMenu);
  if (menuCloseBtn) menuCloseBtn.addEventListener('click', closeMenu);

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeMenu();
  });

  function propagateAuthStateToMobile() {
    const desktop = authBtnDesktop();
    const mobile = authBtnMobile();
    if (!mobile) return;

    if (!desktop) {
      mobile.textContent = 'LOGIN';
      mobile.onclick = () => { window.location.href = 'login.html'; };
      return;
    }

    try {
      const desktopText = (desktop.textContent || '').trim();
      if ((mobile.textContent || '').trim() !== desktopText) {
        mobile.textContent = desktopText || 'LOGIN';
      }
    } catch (e) {}

    mobile.onclick = function (e) {
      // close menu first
      closeMenu();
      const handler = desktop.onclick;
      if (typeof handler === 'function') {
        setTimeout(() => {
          try { handler.call(desktop, e); } catch (err) { console.error('desktop onclick error', err); }
        }, 120);
      } else {
        setTimeout(() => { window.location.href = 'login.html'; }, 120);
      }
    };
  }

  function syncNextTagText() {
    const desktop = nextDesktopEl();
    const mobile = nextMobileEl();
    if (!mobile) return;
    const desktopTxt = desktop ? (desktop.textContent || desktop.innerText || '').trim() : '';
    const mobileTxt = (mobile.textContent || mobile.innerText || '').trim();
    const final = desktopTxt || mobileTxt || 'Próx. sábado: --';
    if (mobileTxt !== final) {
      try { mobile.textContent = final; } catch (e) {}
    }
  }

  const debouncedSyncNext = debounce(syncNextTagText, 100);
  const debouncedPropagateAuth = debounce(propagateAuthStateToMobile, 100);

  let nextObserver = null;
  let authObserver = null;

  function startObserversIfNeeded() {
    const nextDesktop = nextDesktopEl();
    if (nextDesktop && !nextObserver) {
      nextObserver = new MutationObserver(debouncedSyncNext);
      try {
        nextObserver.observe(nextDesktop, { childList: true, characterData: true, subtree: true });
      } catch (e) {
        try { nextObserver.observe(nextDesktop, { childList: true, subtree: true }); } catch (err) { console.warn('nextObserver fallback failed', err); }
      }
    }

    const authDesktop = authBtnDesktop();
    if (authDesktop && !authObserver) {
      authObserver = new MutationObserver(debouncedPropagateAuth);
      try {
        authObserver.observe(authDesktop, { childList: true, characterData: true, subtree: true });
      } catch (e) {
        try { authObserver.observe(authDesktop, { childList: true, subtree: true }); } catch (err) { console.warn('authObserver fallback failed', err); }
      }
    }
  }

  function stopObservers() {
    try { if (nextObserver) { nextObserver.disconnect(); nextObserver = null; } } catch (e) {}
    try { if (authObserver) { authObserver.disconnect(); authObserver = null; } } catch (e) {}
  }

  function safeInit() {
    propagateAuthStateToMobile();
    syncNextTagText();
    startObserversIfNeeded();
  }

  (function tryInit(retries = 8, delay = 300) {
    safeInit();
    if (retries > 0) {
      const needNext = !nextDesktopEl();
      const needAuth = !authBtnDesktop();
      if (needNext || needAuth) setTimeout(() => tryInit(retries - 1, delay), delay);
    }
  })();

  if (mobilePanel) {
    mobilePanel.addEventListener('click', (ev) => {
      const a = ev.target.closest('a');
      if (a) setTimeout(closeMenu, 120);
    });
  }

  window.addEventListener('unload', () => {
    stopObservers();
  });

  window.GAMEUAU_HEADER = window.GAMEUAU_HEADER || {};
  window.GAMEUAU_HEADER.syncNextTagText = syncNextTagText;
  window.GAMEUAU_HEADER.propagateAuthStateToMobile = propagateAuthStateToMobile;
  window.GAMEUAU_HEADER.openMenu = openMenu;
  window.GAMEUAU_HEADER.closeMenu = closeMenu;

})();
