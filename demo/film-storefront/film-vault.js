(() => {
  'use strict';
  const root = document.querySelector('[data-film-vault]');
  if (!root || root.dataset.vaultReady) return;
  root.dataset.vaultReady = 'true';
  const buttons = [...root.querySelectorAll('[data-vault-photo]')];
  const photos = buttons.map(button => ({src: button.dataset.src, alt: button.dataset.alt, caption: button.dataset.caption}));
  const image = root.querySelector('[data-vault-image]');
  const stage = root.querySelector('[data-vault-open]');
  const caption = root.querySelector('[data-vault-caption]');
  const status = root.querySelector('[data-vault-status]');
  const dialogStatus = root.querySelector('[data-vault-dialog-status]');
  const dialog = root.querySelector('[data-vault-dialog]');
  const fullImage = root.querySelector('[data-vault-dialog-image]');
  const fullCaption = root.querySelector('[data-vault-dialog-caption]');
  const fullStage = root.querySelector('[data-vault-dialog-stage]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  let target = 0;
  let request = 0;
  let suppressClickUntil = 0;
  let returnFocus = null;
  let previousOverflow = '';
  let ghost = null;
  let transition = null;
  const loads = new Map();

  function report(message, error = false) {
    [status, dialogStatus].forEach(region => {
      region.textContent = message;
      region.classList.toggle('is-error', error);
    });
  }

  function loadPhoto(src) {
    if (loads.has(src)) return loads.get(src);
    const loading = new Promise((resolve, reject) => {
      const preload = new Image();
      const timeout = setTimeout(() => {preload.onload = null; preload.onerror = null; reject(new Error('Image timed out'));}, 15000);
      preload.decoding = 'async';
      preload.onload = async () => {
        try { if (preload.decode) await preload.decode(); } catch (_) { /* A loaded image remains usable if decode is unavailable. */ }
        clearTimeout(timeout);
        resolve(preload);
      };
      preload.onerror = () => {clearTimeout(timeout); reject(new Error('Image unavailable'));};
      preload.src = src;
    });
    loads.set(src, loading);
    loading.catch(() => loads.delete(src));
    return loading;
  }

  function updateFullImage() {
    fullImage.src = photos[current].src;
    fullImage.alt = photos[current].alt;
    fullCaption.textContent = photos[current].caption;
  }

  async function select(index, direction = 1) {
    target = (index + photos.length) % photos.length;
    const selected = target;
    const token = ++request;
    report('');
    stage.setAttribute('aria-busy', 'true');
    fullStage.setAttribute('aria-busy', 'true');
    const loadingNotice = setTimeout(() => {
      if (token === request) report('Loading photograph…');
    }, 700);
    try {
      await loadPhoto(photos[selected].src);
      if (token !== request) return;
      if (transition) {transition.cancel(); transition = null;}
      if (ghost) {ghost.remove(); ghost = null;}
      if (selected !== current && !reducedMotion.matches && image.complete && image.naturalWidth && stage.animate) {
        ghost = image.cloneNode(false);
        ghost.removeAttribute('data-vault-image');
        ghost.className = 'vault-ghost';
        ghost.alt = '';
        ghost.setAttribute('aria-hidden', 'true');
        stage.append(ghost);
      }
      current = selected;
      image.src = photos[current].src;
      image.alt = photos[current].alt;
      caption.textContent = photos[current].caption;
      buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === current)));
      root.querySelectorAll('[data-vault-count]').forEach(counter => {counter.textContent = `${current + 1} / ${photos.length}`;});
      if (dialog.open) updateFullImage();
      report(`${current + 1} of ${photos.length}. ${photos[current].caption}`);
      // The old frame only fades after the replacement has decoded. A newer selection cancels it safely.
      if (ghost) {
        const outgoing = ghost;
        transition = outgoing.animate([
          {opacity: 1, transform: 'translateX(0)'},
          {opacity: 0, transform: `translateX(${-direction * 12}px)`}
        ], {duration: 360, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards'});
        transition.finished.then(() => {
          outgoing.remove();
          if (ghost === outgoing) {ghost = null; transition = null;}
        }).catch(() => outgoing.remove());
      }
    } catch (_) {
      if (token === request) {
        target = current;
        report('That photograph could not load. Select it again to retry.', true);
      }
    } finally {
      clearTimeout(loadingNotice);
      if (token === request) {stage.removeAttribute('aria-busy'); fullStage.removeAttribute('aria-busy');}
    }
  }

  buttons.forEach((button, index) => button.addEventListener('click', () => select(index, index >= current ? 1 : -1)));
  root.querySelectorAll('[data-vault-prev]').forEach(button => button.addEventListener('click', () => select(target - 1, -1)));
  root.querySelectorAll('[data-vault-next]').forEach(button => button.addEventListener('click', () => select(target + 1, 1)));
  root.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      select(target + direction, direction);
    }
  });

  function bindSwipe(surface) {
    let start = null;
    surface.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      start = {x: event.clientX, y: event.clientY, id: event.pointerId};
    });
    surface.addEventListener('pointerup', event => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      suppressClickUntil = Date.now() + 450;
      const direction = dx < 0 ? 1 : -1;
      select(target + direction, direction);
    });
    surface.addEventListener('pointercancel', () => {start = null;});
    surface.addEventListener('pointerleave', event => {if (event.pointerType === 'mouse') start = null;});
  }
  bindSwipe(stage);
  bindSwipe(fullStage);

  function initialImageError() {
    report('This photograph could not load. Choose a frame below to try again.', true);
  }
  image.addEventListener('error', initialImageError);
  if (image.complete && !image.naturalWidth) initialImageError();

  stage.addEventListener('click', event => {
    if (event.detail > 0 && Date.now() < suppressClickUntil) return;
    if (!image.complete || !image.naturalWidth) {select(current); return;}
    if (!dialog.showModal || dialog.open) return;
    returnFocus = document.activeElement;
    updateFullImage();
    previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    root.querySelector('[data-vault-close]').focus({preventScroll: true});
  });
  root.querySelector('[data-vault-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({preventScroll: true});
  });
  reducedMotion.addEventListener?.('change', () => {
    if (reducedMotion.matches && transition) {transition.cancel(); transition = null;}
    if (reducedMotion.matches && ghost) {ghost.remove(); ghost = null;}
  });
})();
