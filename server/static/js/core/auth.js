(function () {
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
      window.location.assign('/login?changed=1');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '修改口令失败，请重试。');
    }
  });
})();
