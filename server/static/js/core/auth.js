(function () {
  var config = window.DOCNEST_CONFIG || {};
  if (config.authEnabled !== true) return;

  var storageKey = config.authStorageKey || 'docnest:auth-passphrase';
  var verificationPromise = null;

  function readPassphrase() {
    try {
      return window.localStorage.getItem(storageKey) || '';
    } catch (error) {
      return '';
    }
  }

  function writePassphrase(passphrase) {
    try {
      window.localStorage.setItem(storageKey, passphrase);
      return true;
    } catch (error) {
      return false;
    }
  }

  function clearPassphrase() {
    try {
      window.localStorage.removeItem(storageKey);
    } catch (error) {
      // The browser may block storage; the next request will simply ask again.
    }
  }

  function currentPageUrl() {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  function safeNextPath(value) {
    if (
      typeof value !== 'string' ||
      value.charAt(0) !== '/' ||
      value.indexOf('//') === 0 ||
      value.indexOf('\\') !== -1 ||
      /[\r\n]/.test(value)
    ) return '/';
    return value;
  }

  function redirectToLogin() {
    var next = encodeURIComponent(currentPageUrl() || '/');
    window.location.replace('/login?next=' + next);
  }

  function verifyWithBackend(passphrase) {
    return fetch('/auth/verify', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ passphrase: passphrase }),
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (result) {
        return { ok: response.ok && result.ok === true, error: result.error || '', unavailable: false };
      });
    }).catch(function () {
      return { ok: false, error: '无法连接授权服务，请稍后重试。', unavailable: true };
    });
  }

  function ensureAuthorized() {
    if (verificationPromise) return verificationPromise;
    var passphrase = readPassphrase();
    if (!passphrase) return Promise.resolve(false);

    verificationPromise = verifyWithBackend(passphrase).then(function (result) {
      if (!result.ok) {
        clearPassphrase();
        return false;
      }
      return true;
    }).finally(function () {
      verificationPromise = null;
    });
    return verificationPromise;
  }

  window.docNestEnsureAuthorized = ensureAuthorized;
  window.docNestRedirectToLogin = redirectToLogin;

  function removePendingState() {
    document.documentElement.classList.remove('docnest-auth-pending');
  }

  function initChangePassword() {
    var modal = document.getElementById('auth-change-password-modal');
    var openButton = document.getElementById('auth-change-password-btn');
    var form = document.getElementById('auth-change-password-form');
    var error = document.getElementById('auth-change-password-error');
    if (!modal || !openButton || !form) return;

    var closeButtons = modal.querySelectorAll('[data-auth-close]');

    function setError(message) {
      if (!error) return;
      error.textContent = message || '';
      error.hidden = !message;
    }

    function closeModal() {
      modal.hidden = true;
      setError('');
      form.reset();
    }

    openButton.addEventListener('click', function () {
      modal.hidden = false;
      var firstInput = form.querySelector('input');
      if (firstInput) firstInput.focus();
    });

    closeButtons.forEach(function (button) {
      button.addEventListener('click', closeModal);
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      setError('');
      var formData = new FormData(form);
      var nextPassphrase = String(formData.get('nextPassphrase') || '');
      var confirmPassphrase = String(formData.get('confirmPassphrase') || '');
      if (nextPassphrase !== confirmPassphrase) {
        setError('两次输入的新口令不一致。');
        return;
      }

      try {
        var response = await fetch('/auth/change-password', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            currentPassphrase: String(formData.get('currentPassphrase') || ''),
            nextPassphrase: nextPassphrase,
          }),
        });
        var result = await response.json().catch(function () { return {}; });
        if (!response.ok || !result.ok) {
          throw new Error(result.error || '修改口令失败，请重试。');
        }
        clearPassphrase();
        window.location.assign('/login?changed=1');
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : '修改口令失败，请重试。');
      }
    });
  }

  function initLogout() {
    document.querySelectorAll('.auth-logout-form').forEach(function (form) {
      form.addEventListener('submit', function () {
        clearPassphrase();
      });
    });
  }

  function initLoginPage() {
    var form = document.querySelector('.auth-login-form');
    var error = document.querySelector('.auth-login-form .auth-form-error');
    var passphraseInput = form ? form.querySelector('input[name="passphrase"]') : null;
    var nextInput = form ? form.querySelector('input[name="next"]') : null;
    if (!form || !passphraseInput) return;

    function setError(message) {
      if (!error) return;
      error.textContent = message || '';
      error.hidden = !message;
    }

    async function submitPassphrase(passphrase, auto) {
      if (!passphrase) return false;
      if (!auto) setError('');
      var result = await verifyWithBackend(passphrase);
      if (!result.ok) {
        if (auto && !result.unavailable) clearPassphrase();
        setError(auto && !result.unavailable ? '本地保存的口令已失效，请输入新口令。' : (result.error || '口令不正确，请重试。'));
        if (!auto) passphraseInput.focus();
        return false;
      }
      if (!writePassphrase(passphrase)) {
        setError('浏览器拒绝保存口令，请检查本地存储权限。');
        return false;
      }
      window.location.replace(safeNextPath(nextInput ? nextInput.value : '/'));
      return true;
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submitPassphrase(String(passphraseInput.value || ''), false);
    });

    var cachedPassphrase = readPassphrase();
    if (cachedPassphrase) submitPassphrase(cachedPassphrase, true);
  }

  function initProtectedPage() {
    ensureAuthorized().then(function (authorized) {
      if (!authorized) {
        redirectToLogin();
        return;
      }
      removePendingState();
      initChangePassword();
      initLogout();
    });
  }

  if (document.body && document.body.classList.contains('auth-page')) {
    initLoginPage();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProtectedPage);
  } else {
    initProtectedPage();
  }
})();
