(() => {
  'use strict';
  const root = document.documentElement;
  const header = document.querySelector('.journey-header');
  const hero = document.querySelector('.hero');
  if (!root.hasAttribute('data-price-size') || !header || !hero) return;

  const choices = [
    ['01', 'Quiet'], ['02', 'Compact'], ['03', 'Balanced'],
    ['04', 'Confident'], ['05', 'Strong'],
  ];
  const allowed = new Set(choices.map(([id]) => id));
  const requested = new URL(location.href).searchParams.get('size');
  const initial = allowed.has(requested) ? requested : '03';
  const controls = document.createElement('div');
  controls.className = 'size-review';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Compare five smaller price sizes. Select a number to replay its reveal.');
  controls.innerHTML = `<div class="size-review-heading"><span data-size-label aria-live="polite"></span><button class="size-opening" type="button" aria-label="Replay the full hat opening" title="Replay the full hat opening"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 8a6 6 0 1 1 .4 5M4 3v5h5"/></svg></button></div><div class="size-options">${choices.map(([id, name]) => `<button type="button" class="size-choice" data-size="${id}" aria-label="Option ${id}: ${name}" aria-pressed="false" title="${name} — tap to replay">${id}</button>`).join('')}</div>`;
  header.append(controls);
  const label = controls.querySelector('[data-size-label]');
  const buttons = [...controls.querySelectorAll('[data-size]')];

  function select(id, replay = false) {
    if (!allowed.has(id)) return;
    root.dataset.priceSize = id;
    const name = choices.find(([key]) => key === id)[1];
    label.textContent = `${id} · ${name}`;
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.size === id)));
    const url = new URL(location.href);
    url.searchParams.set('size', id);
    history.replaceState(history.state, '', url);
    if (!replay || !hero.classList.contains('intro-complete') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Restart only the price and pointer. The hat and product layout stay still.
    hero.querySelectorAll('.purchase-price .price-reveal,.buy-pointer path').forEach(path => {
      path.getAnimations().forEach(animation => {
        animation.currentTime = 0;
        animation.play();
      });
    });
  }
  buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.size, true)));
  controls.querySelector('.size-opening').addEventListener('click', () => location.reload());
  select(initial);
})();
