(() => {
  'use strict';

  document.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.closest('.password-input')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'password-input';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const button = document.createElement('button');
    button.className = 'password-toggle';
    button.type = 'button';
    button.setAttribute('aria-label', 'Mostrar contraseña');
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = '<span class="password-eye" aria-hidden="true"></span>';
    wrapper.appendChild(button);

    button.addEventListener('click', () => {
      const isVisible = input.type === 'text';
      input.type = isVisible ? 'password' : 'text';
      button.setAttribute('aria-pressed', String(!isVisible));
      button.setAttribute('aria-label', isVisible ? 'Mostrar contraseña' : 'Ocultar contraseña');
      input.focus({ preventScroll: true });
    });
  });
})();
