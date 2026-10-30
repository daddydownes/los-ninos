/* One bounded drawing surface: a fast swipe never promotes an undecoded image. */
(() => {
  'use strict';
  const section = document.querySelector('.zoom-journey');
  if (!section) return;
  const windowElement = section.querySelector('.zoom-window');
  const figures = [...section.querySelectorAll('.zoom-photo')];
  const images = figures.map(figure => figure.querySelector('img'));
  const dots = [...section.querySelectorAll('.zoom-dots button')];
  const hint = section.querySelector('[data-zoom-hint]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width:700px)');
  const canvas = document.createElement('canvas');
  canvas.className = 'zoom-canvas';
  canvas.setAttribute('role', 'img');
  canvas.hidden = true;
  windowElement.append(canvas);
  const context = canvas.getContext('2d', {alpha: false});
  // The stage can fill 100dvh, but toolbar expansion must not change the
  // distance between photograph stops. This ruler uses the stable 100svh.
  const distance = document.createElement('div');
  distance.className = 'zoom-distance';
  distance.setAttribute('aria-hidden', 'true');
  section.append(distance);

  const last = images.length - 1;
  // A shorter final hold; zoom.css reduces total travel proportionally so
  // the distance between photographs stays unchanged.
  const span = last + .08;
  const ratio = 5;
  const ready = images.map(() => false);
  const decoding = images.map(() => false);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  let frame = 0, loading = false, revision = 0, lastKey = '', shown = -1;
  let contextLost = false, bagOpen = false;

  function schedule() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(paint);
  }
  async function decode(index) {
    if (ready[index] || decoding[index]) return;
    decoding[index] = true;
    try {
      await images[index].decode();
      if (images[index].naturalWidth) {
        ready[index] = true;
        revision++;
        schedule(); // A completed download must recover even without a swipe.
      }
    } catch (_) {
      // Keep the last decoded photograph; load/online events can retry later.
    } finally {
      decoding[index] = false;
    }
  }
  function load() {
    if (loading) return;
    loading = true;
    images.forEach((image, index) => {
      image.decoding = 'async';
      image.fetchPriority = 'low';
      image.loading = 'eager';
      decode(index);
    });
  }
  images.forEach((image, index) => image.addEventListener('load', () => decode(index)));
  // All five existing files total about 0.5 MB. Prepare them after the opening,
  // with a near-section trigger for direct links/restored scroll positions.
  document.addEventListener('ln:intro-complete', load, {once: true});
  if (!document.documentElement.classList.contains('intro-pending')) load();
  if ('IntersectionObserver' in window) {
    const approach = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { load(); approach.disconnect(); }
    }, {rootMargin: '200% 0px'});
    approach.observe(section);
  } else load();

  function fallback(index) {
    canvas.hidden = true;
    section.dataset.zoomRenderer = 'fallback';
    figures.forEach((figure, i) => {
      figure.hidden = i !== index;
      figure.removeAttribute('aria-hidden');
    });
  }
  function chooseBackground(wanted) {
    if (ready[wanted]) return wanted;
    if (shown >= 0 && ready[shown]) return shown;
    for (let i = wanted; i >= 0; i--) if (ready[i]) return i;
    return ready.findIndex(Boolean);
  }

  function drawPhoto(index, scale, width, height) {
    const image = images[index];
    const w = width * scale, h = height * scale;
    const x = (width - w) / 2, y = (height - h) / 2;
    const border = 2 * scale;
    context.fillStyle = '#f3eee5';
    context.fillRect(x - border, y - border, w + border * 2, h + border * 2);
    context.fillStyle = '#080f19';
    context.fillRect(x, y, w, h);
    const fit = (mobile.matches ? Math.max : Math.min)(w / image.naturalWidth, h / image.naturalHeight);
    const iw = image.naturalWidth * fit, ih = image.naturalHeight * fit;
    const ix = x + (w - iw) / 2, iy = y + (h - ih) / 2;
    // Crop in source coordinates instead of asking the compositor to allocate
    // a many-screen-wide image. Every destination stays within this canvas.
    const left = Math.max(0, x, ix), top = Math.max(0, y, iy);
    const right = Math.min(width, x + w, ix + iw), bottom = Math.min(height, y + h, iy + ih);
    if (right <= left || bottom <= top) return;
    context.drawImage(image, (left - ix) / fit, (top - iy) / fit,
      (right - left) / fit, (bottom - top) / fit,
      left, top, right - left, bottom - top);
  }

  function paint() {
    frame = 0;
    if (bagOpen || document.documentElement.hasAttribute('data-journey-bag-open') || document.hidden) return;
    const bounds = section.getBoundingClientRect();
    if (bounds.bottom < 0 || bounds.top > innerHeight) return;
    load();
    const travel = Math.max(1, distance.clientHeight);
    const raw = clamp(-bounds.top / travel * span, 0, last);
    const nearest = Math.round(raw);
    const depth = Math.abs(raw - nearest) <= span / travel ? nearest : raw;
    section.dataset.zoomDepth = String(depth);
    const wanted = motion.matches ? Math.round(depth) : Math.floor(depth);
    const background = chooseBackground(wanted);
    if (background < 0) return;
    const renderedDepth = background === wanted ? (motion.matches ? wanted : depth) : background;
    const width = windowElement.clientWidth, height = windowElement.clientHeight;
    if (!width || !height) return;
    const pixelRatio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(3000000 / (width * height)));
    const pixelWidth = Math.max(1, Math.floor(width * pixelRatio));
    const pixelHeight = Math.max(1, Math.floor(height * pixelRatio));
    const key = [wanted, renderedDepth, pixelWidth, pixelHeight, revision, motion.matches, mobile.matches].join(':');
    if (key === lastKey) return;
    shown = background;
    dots.forEach((button, index) => button.setAttribute('aria-current', String(index === background)));
    hint.textContent = background === last ? 'Scroll to shop' : 'Scroll to explore';
    if (!context || contextLost) { fallback(background); return; }
    try {
      // Resizing clears a canvas. Resize and draw together in this same frame.
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.fillStyle = '#080f19';
      context.fillRect(0, 0, width, height);
      drawPhoto(background, Math.pow(ratio, renderedDepth - background), width, height);
      if (!motion.matches && background === wanted) {
        for (let i = background + 1; i <= last; i++) {
          if (!ready[i]) break;
          const scale = Math.pow(ratio, renderedDepth - i);
          if (Math.min(width, height) * scale * pixelRatio < 1) break;
          drawPhoto(i, scale, width, height);
        }
      }
      canvas.dataset.photo = String(background);
      canvas.dataset.depth = String(renderedDepth);
      canvas.setAttribute('aria-label', images[background].alt);
      canvas.hidden = false;
      figures.forEach(figure => { figure.hidden = true; figure.setAttribute('aria-hidden', 'true'); });
      section.dataset.zoomRenderer = 'canvas';
      lastKey = key;
    } catch (_) {
      fallback(background);
      lastKey = '';
    }
  }

  canvas.addEventListener('contextlost', event => {
    event.preventDefault(); contextLost = true; lastKey = '';
    fallback(Math.max(0, shown));
  });
  canvas.addEventListener('contextrestored', () => { contextLost = false; lastKey = ''; schedule(); });
  addEventListener('scroll', schedule, {passive: true});
  addEventListener('resize', schedule, {passive: true});
  addEventListener('pageshow', () => { lastKey = ''; schedule(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastKey = ''; schedule(); } });
  document.addEventListener('ln:bag-visibility', event => { bagOpen = event.detail.open; if (!bagOpen) schedule(); });
  motion.addEventListener('change', schedule);
  mobile.addEventListener('change', schedule);
  const observer = new ResizeObserver(schedule);
  observer.observe(windowElement);
  observer.observe(distance);
  addEventListener('online', () => {
    images.forEach((image, index) => {
      if (!ready[index] && !decoding[index]) { image.src = image.getAttribute('src'); decode(index); }
    });
  });
  // Demo: one deliberate gesture per photograph. Never queue transitions.
  // Keep native scrolling outside the photographs and allow pinch zoom/controls.
  let animation = 0, touching = false, consumed = false, originX = 0, originY = 0;
  let entryLimit = null, wheelTimer = 0, wheelUsed = false, wheelTotal = 0;
  function geometry() {
    const start = scrollY + section.getBoundingClientRect().top;
    const step = Math.max(1, distance.clientHeight) / span;
    return {start, step, end: start + step * last};
  }
  function blocked(target) {
    return bagOpen || document.documentElement.hasAttribute('data-journey-bag-open') ||
      target?.closest?.('button,a,input,select,textarea,[contenteditable],dialog');
  }
  function cancelStep() { cancelAnimationFrame(animation); animation = 0; }
  function settle(top) {
    cancelStep(); entryLimit = null;
    const from = scrollY, started = performance.now();
    const duration = motion.matches ? 0 : 650;
    function tick(now) {
      const t = duration ? Math.min(1, (now - started) / duration) : 1;
      const ease = t * t * (3 - 2 * t);
      window.scrollTo({top: from + (top - from) * ease, behavior: 'instant'});
      if (t < 1) animation = requestAnimationFrame(tick); else animation = 0;
    }
    animation = requestAnimationFrame(tick);
  }
  function nextStop(direction) {
    const {start, step, end} = geometry();
    const depth = (scrollY - start) / step;
    if (scrollY < start - 2 || scrollY > end + 2) return null;
    if (direction < 0 && depth <= .015) return null;
    if (direction > 0 && depth >= last - .015) return null;
    const index = direction > 0 ? Math.floor(depth + .015) + 1 : Math.ceil(depth - .015) - 1;
    return start + clamp(index, 0, last) * step;
  }
  document.addEventListener('touchstart', event => {
    entryLimit = null; touching = false; consumed = false;
    if (event.touches.length !== 1 || blocked(event.target)) return;
    cancelStep(); touching = true;
    originX = event.touches[0].clientX; originY = event.touches[0].clientY;
    const {start, end} = geometry();
    if (scrollY < start - 2) entryLimit = {top: start, direction: 1};
    else if (scrollY > end + 2) entryLimit = {top: end, direction: -1};
  }, {passive: true});
  document.addEventListener('touchmove', event => {
    if (!touching || event.touches.length !== 1 || blocked(event.target)) return;
    const dy = originY - event.touches[0].clientY;
    const dx = originX - event.touches[0].clientX;
    if (Math.abs(dx) > Math.abs(dy) || Math.abs(dy) < 12) return;
    if (consumed) { if (event.cancelable) event.preventDefault(); return; }
    const top = nextStop(Math.sign(dy));
    if (top === null || !event.cancelable) return;
    event.preventDefault(); consumed = true; settle(top);
  }, {passive: false});
  document.addEventListener('touchend', () => { touching = false; }, {passive: true});
  document.addEventListener('touchcancel', () => {
    touching = false; entryLimit = null; consumed = false;
  }, {passive: true});
  // Catch native fling momentum entering from the preceding/following section.
  addEventListener('scroll', () => {
    if (!entryLimit || blocked(null)) return;
    if ((scrollY - entryLimit.top) * entryLimit.direction > 0) {
      const top = entryLimit.top; entryLimit = null; consumed = true;
      window.scrollTo({top, behavior: 'instant'});
    }
  }, {passive: true});
  document.addEventListener('wheel', event => {
    entryLimit = null;
    if (event.ctrlKey || blocked(event.target) || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelUsed = false; wheelTotal = 0; }, 180);
    if (wheelUsed || animation) { if (event.cancelable) event.preventDefault(); return; }
    let top = nextStop(Math.sign(event.deltaY));
    const {start, end} = geometry();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    if (top === null && scrollY < start && scrollY + delta >= start) top = start;
    if (top === null && scrollY > end && scrollY + delta <= end) top = end;
    if (top === null || !event.cancelable) return;
    event.preventDefault(); wheelTotal += delta;
    if (Math.abs(wheelTotal) < 24) return;
    wheelUsed = true; settle(top);
  }, {passive: false});
  addEventListener('keydown', () => { entryLimit = null; cancelStep(); });
  document.addEventListener('ln:bag-visibility', () => { entryLimit = null; cancelStep(); });
  function travel(top) {
    entryLimit = null; cancelStep();
    window.scrollTo({top, behavior: motion.matches ? 'instant' : 'smooth'});
  }
  dots.forEach((button, index) => button.addEventListener('click', () => {
    load(); travel(scrollY + section.getBoundingClientRect().top + distance.clientHeight * index / span);
  }));
  document.querySelectorAll('.zoom-revisit').forEach(link => link.addEventListener('click', event => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) { event.preventDefault(); travel(scrollY + target.getBoundingClientRect().top); }
  }));
  schedule();
})();
