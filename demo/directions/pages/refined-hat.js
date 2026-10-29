/* Registered original PNG views, cut at their angular intervals in a 3.6s loop. */
(() => {
  'use strict';
  const section = document.querySelector('[data-refined-hat]');
  if (!section) return;
  const stage = section.querySelector('[data-refined-stage]');
  const image = section.querySelector('[data-refined-image]');
  const toggle = section.querySelector('[data-refined-toggle]');
  const status = section.querySelector('[data-refined-status]');
  if (!stage || !image || !toggle || !status) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const LOOP_MS = 3600;
  const cache = new Map();
  const poster = Object.fromEntries(['href', 'width', 'height', 'transform'].map(name => [name, image.getAttribute(name)]));
  let frames = [], decoded = [], position = 0, elapsed = 0, lastTick = null, animation = null;
  let ready = false, loading = false, failed = false, near = false, visible = false;
  let userPaused = false, explicitPlay = false;
  let introReady = !document.documentElement.classList.contains('intro-pending');

  function wantsMotion() { return !userPaused && (!motion.matches || explicitPlay); }
  function canAnimate() { return ready && introReady && visible && !document.hidden && wantsMotion(); }
  function updateControl() {
    toggle.hidden = false;
    toggle.disabled = loading;
    toggle.textContent = loading ? 'Loading…' : failed ? 'Retry rotation' : ready && wantsMotion() ? 'Pause rotation' : 'Play rotation';
  }
  function stop() {
    if (animation !== null) cancelAnimationFrame(animation);
    animation = null; lastTick = null;
    section.dataset.running = 'false';
    stage.setAttribute('aria-label', position === 0 ? 'Front view of the Los Niños OG Snapback' : 'View of the Los Niños OG Snapback');
  }
  function showFront() {
    position = 0; elapsed = 0;
    for (const [name, value] of Object.entries(poster)) image.setAttribute(name, value);
    section.dataset.frame = '0';
    stage.setAttribute('aria-label', 'Front view of the Los Niños OG Snapback');
  }
  function show(index) {
    const frame = frames[index];
    if (!frame || !decoded[index]) return;
    position = index;
    image.setAttribute('width', frame.sourceDimensions[0]);
    image.setAttribute('height', frame.sourceDimensions[1]);
    image.setAttribute('transform', `translate(${frame.registration.x} ${frame.registration.y}) scale(${frame.registration.scale})`);
    image.setAttribute('href', frame.src);
    section.dataset.frame = String(index);
  }
  function frameDuration(index, items) {
    const next = (index + 1) % items.length;
    const gap = (items[next].angle - items[index].angle + 360) % 360;
    return LOOP_MS * gap / 360;
  }
  function advance(index, carryMs, deltaMs, items) {
    let remaining = (carryMs + Math.max(0, deltaMs)) % LOOP_MS;
    let next = index;
    for (let steps = 0; steps < items.length; steps++) {
      const dwell = frameDuration(next, items);
      if (remaining + 1e-7 < dwell) break;
      remaining = Math.max(0, remaining - dwell);
      next = (next + 1) % items.length;
    }
    return {index: next, elapsed: remaining};
  }
  function tick(now) {
    if (!canAnimate()) { stop(); updateControl(); return; }
    if (lastTick !== null) {
      const next = advance(position, elapsed, now - lastTick, frames);
      elapsed = next.elapsed;
      if (next.index !== position) show(next.index);
    }
    lastTick = now;
    animation = requestAnimationFrame(tick);
  }
  function sync() {
    if (canAnimate()) {
      if (animation === null) {
        lastTick = null;
        animation = requestAnimationFrame(tick);
        section.dataset.running = 'true';
        stage.setAttribute('aria-label', 'Rotating view of the Los Niños OG Snapback');
      }
    } else stop();
    updateControl();
  }
  function validate(data) {
    if (!Array.isArray(data.frames) || data.expectedFrames !== 52 || data.frames.length !== data.expectedFrames) throw new Error('Incomplete refined sequence');
    const ordered = [...data.frames].sort((a, b) => a.index - b.index);
    ordered.forEach((frame, index) => {
      const reg = frame.registration, dimensions = frame.sourceDimensions;
      if (frame.index !== index || typeof frame.src !== 'string' || !frame.src || !reg || !Array.isArray(dimensions) || dimensions.length !== 2 || ![reg.x, reg.y, reg.scale, ...dimensions].every(Number.isFinite) || reg.scale <= 0 || dimensions.some(n => n <= 0)) throw new Error('Invalid frame registration');
      if (!Number.isFinite(frame.angle) || frame.angle < 0 || frame.angle >= 360 || (index === 0 && frame.angle !== 0) || (index > 0 && frame.angle <= ordered[index - 1].angle)) throw new Error('Invalid frame angles');
    });
    return ordered;
  }
  function loadImage(frame) {
    const source = new URL(frame.src, document.baseURI).href;
    if (cache.has(source)) return cache.get(source);
    const promise = new Promise((resolve, reject) => {
      const item = new Image();
      item.decoding = 'async';
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timeout);
        item.onload = null; item.onerror = null;
        if (error) reject(error); else resolve(item);
      };
      const timeout = setTimeout(() => finish(new Error('Image loading timed out')), 60000);
      item.onload = async () => {
        try {
          if (item.decode) await item.decode();
          if (!item.naturalWidth) throw new Error('Image could not decode');
          finish();
        } catch (error) { finish(error); }
      };
      item.onerror = () => finish(new Error('Image could not load'));
      item.src = source;
    }).catch(error => { cache.delete(source); throw error; });
    cache.set(source, promise);
    return promise;
  }
  async function load() {
    if (ready || loading) return;
    loading = true; failed = false;
    section.dataset.rotationState = 'loading';
    status.hidden = false; status.textContent = 'Loading rotation…';
    updateControl();
    try {
      const response = await fetch(section.dataset.refinedManifest);
      if (!response.ok) throw new Error('Sequence unavailable');
      frames = validate(await response.json());
      frames.forEach(frame => { frame.src = new URL(frame.src, response.url).href; });
      let cursor = 0, complete = 0;
      const errors = [];
      async function worker() {
        while (cursor < frames.length) {
          const index = cursor++;
          try { decoded[index] = await loadImage(frames[index]); }
          catch (error) { errors.push(error); }
          complete++;
          if (complete % 4 === 0 || complete === frames.length) status.textContent = `Loading rotation… ${Math.round(complete / frames.length * 100)}%`;
        }
      }
      await Promise.all([worker(), worker(), worker(), worker()]);
      if (errors.length) throw errors[0];
      ready = true; loading = false;
      section.dataset.rotationState = 'ready';
      status.hidden = true; status.textContent = '';
      show(0);
      sync();
    } catch (_) {
      loading = false; failed = true; ready = false;
      stop(); showFront();
      section.dataset.rotationState = 'error';
      status.hidden = false;
      status.textContent = 'The front view is shown. Rotation couldn’t load.';
      updateControl();
    }
  }
  function maybeLoad() {
    if (near && introReady && !document.hidden && !motion.matches && !failed) load();
  }
  toggle.addEventListener('click', () => {
    if (loading) return;
    if (ready && wantsMotion()) {
      userPaused = true; explicitPlay = false;
    } else {
      userPaused = false; explicitPlay = true;
      if (!ready) load();
    }
    sync();
  });
  motion.addEventListener('change', () => {
    explicitPlay = false;
    if (motion.matches) { stop(); showFront(); }
    maybeLoad(); sync();
  });
  document.addEventListener('visibilitychange', () => { maybeLoad(); sync(); });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', () => { maybeLoad(); sync(); });
  document.addEventListener('ln:intro-complete', () => { introReady = true; maybeLoad(); sync(); }, {once: true});
  section.dataset.rotationState = 'idle';
  section.dataset.frame = '0';
  section.dataset.running = 'false';
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      near = entries[0].isIntersecting;
      maybeLoad();
    }, {rootMargin: '600px 0px'}).observe(stage);
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio > 0;
      sync();
    }, {threshold: [0, 0.001]}).observe(stage);
  } else {
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      near = rect.bottom > -600 && rect.top < innerHeight + 600;
      visible = rect.bottom > 0 && rect.top < innerHeight;
      maybeLoad(); sync();
    };
    window.addEventListener('scroll', measure, {passive: true});
    window.addEventListener('resize', measure, {passive: true});
    measure();
  }
  updateControl();
})();
