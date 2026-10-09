(() => {
  'use strict';
  const section = document.querySelector('[data-orbit]');
  if (!section) return;
  const stage = section.querySelector('[data-orbit-stage]');
  const host = section.querySelector('[data-orbit-canvas]');
  const toolbar = section.querySelector('.orbit-toolbar');
  const status = section.querySelector('[data-orbit-status]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 700px), (pointer: coarse)');
  const sequenceURL = new URL(section.dataset.sequence, document.baseURI);
  let requested = false;
  async function withTimeout(promise, cancel) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            cancel();
            reject(new Error('Preview loading timed out'));
          }, 15000);
        })
      ]);
    } finally { clearTimeout(timer); }
  }

  async function load() {
    if (requested) return;
    requested = true;
    section.querySelector('.orbit-retry')?.remove();
    let loading;
    try {
      stage.setAttribute('aria-busy', 'true');
      status.textContent = 'Loading the 360° preview…';
      loading = document.createElement('div');
      loading.className = 'spin-loading';
      loading.setAttribute('role', 'progressbar');
      loading.setAttribute('aria-label', 'Loading the 360-degree preview');
      loading.setAttribute('aria-valuemin', '0');
      loading.setAttribute('aria-valuemax', '100');
      loading.setAttribute('aria-valuenow', '0');
      loading.innerHTML = '<span class="spin-loading-label">Loading the 360° preview…</span><span class="spin-loading-number">0%</span><span class="spin-loading-track"><span></span></span>';
      stage.append(loading);
      const controller = new AbortController();
      const manifest = await withTimeout((async () => {
        const response = await fetch(sequenceURL, {signal: controller.signal});
        if (!response.ok) throw new Error('Sequence unavailable');
        return response.json();
      })(), () => controller.abort());
      // Keep the still usable if no valid sequence has been installed.
      if (!Array.isArray(manifest.frames) || manifest.frames.length < 2) throw new Error('Sequence unavailable');
      const images = new Array(manifest.frames.length);
      const useSmall = compact.matches;
      let next = 0, loaded = 0, failedLoading = false;
      // Two workers keep decoding bounded, without a round trip for each frame.
      // Smaller source files also bound the retained decoded memory on phones.
      async function loadFrames() {
        while (!failedLoading && next < images.length) {
          const index = next++;
          const entry = manifest.frames[index];
          const image = new Image();
          image.decoding = 'async';
          image.fetchPriority = 'low';
          image.src = new URL(typeof entry === 'string' ? entry : (useSmall && entry.srcSmall) || entry.src, sequenceURL).href;
          try { await withTimeout(image.decode(), () => image.removeAttribute('src')); }
          catch (error) { failedLoading = true; throw error; }
          images[index] = image;
          const percent = Math.round(++loaded / images.length * 100);
          loading.setAttribute('aria-valuenow', String(percent));
          loading.querySelector('.spin-loading-number').textContent = percent + '%';
          loading.querySelector('.spin-loading-track>span').style.transform = 'scaleX(' + percent / 100 + ')';
        }
      }
      // Wait for both workers before removing the progress element on failure.
      const results = await Promise.allSettled([loadFrames(), loadFrames()]);
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', {alpha: true});
      if (!ctx) throw new Error('Canvas unavailable');
      canvas.tabIndex = 0;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Interactive AI-rendered 360-degree hat');
      canvas.setAttribute('aria-describedby', 'orbit-instructions');
      host.append(canvas);
      let position = 0, velocity = 0, drag = null, frame = 0, last = 0;
      let visible = false, current = -1, sizeChanged = true;
      let width = stage.clientWidth, height = stage.clientHeight;
      const count = images.length;
      const wrap = value => ((Math.round(value) % count) + count) % count;
      function draw() {
        const index = wrap(position);
        if (index === current) return;
        current = index;
        const image = images[index];
        const entry = manifest.frames[index];
        const alignment = typeof entry === 'object' ? entry : null;
        // Registration coordinates stay in the original source space, including
        // when a smaller mobile texture is used for the same view.
        const sourceWidth = manifest.sourceWidth || image.naturalWidth;
        const sourceHeight = manifest.sourceHeight || image.naturalHeight;
        const unit = Math.min(canvas.width, canvas.height);
        const bounds = alignment?.bounds;
        const registered = manifest.registration === 'fixed-crown-axis-v2';
        const crownPixels = registered ? Math.min(canvas.width * .46 / manifest.radius, canvas.height * .62 / manifest.bottom) : 0;
        const scale = registered ? crownPixels / alignment.crownHeight : Math.min(unit / (alignment?.size || sourceWidth), bounds ? canvas.width * .94 / (bounds[2] - bounds[0]) : Infinity);
        const w = sourceWidth * scale, h = sourceHeight * scale;
        let x = alignment ? canvas.width / 2 - alignment.x * scale : (canvas.width - w) / 2;
        if (bounds && !registered) x = Math.max(canvas.width * .03 - bounds[0] * scale, Math.min(x, canvas.width * .97 - bounds[2] * scale));
        const top = registered ? (canvas.height - manifest.bottom * crownPixels) / 2 : canvas.height * .24;
        const y = alignment ? top - alignment.y * scale : (canvas.height - h) / 2;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, x, y, w, h);
        canvas.dataset.frame = String(index);
      }
      function resize() {
        sizeChanged = false;
        const ratio = Math.min(devicePixelRatio || 1, 2);
        const targetWidth = Math.max(1, Math.round(width * ratio));
        const targetHeight = Math.max(1, Math.round(height * ratio));
        // Resizing an unchanged canvas still clears/reallocates its backing store.
        if (canvas.width === targetWidth && canvas.height === targetHeight) return;
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        current = -1;
      }
      function wake() {
        if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick);
      }
      function tick(now) {
        frame = 0;
        if (!visible || document.hidden) return;
        if (sizeChanged) resize();
        const dt = Math.min((now - (last || now)) / 1000, .04);
        last = now;
        if (!drag && !reduced.matches) {
          position += velocity * dt;
          velocity *= Math.exp(-dt * 7);
        }
        draw();
        if (!drag && !reduced.matches && Math.abs(velocity) > .05) wake();
        else { if (!drag) velocity = 0; last = 0; }
      }
      function stop() {
        velocity = 0;
        last = 0;
      }
      function suspend() {
        stop();
        const pointer = drag?.id;
        drag = null;
        if (pointer !== undefined && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      }
      const resizeObserver = new ResizeObserver(entries => {
        const rect = entries[0].contentRect;
        if (rect.width === width && rect.height === height) return;
        width = rect.width;
        height = rect.height;
        sizeChanged = true;
        wake();
      });
      resizeObserver.observe(stage);
      canvas.addEventListener('pointerdown', event => {
        if (drag || event.button !== 0 || event.isPrimary === false) return;
        stop();
        drag = {id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, time: event.timeStamp, active: false};
      });
      canvas.addEventListener('pointermove', event => {
        if (!drag || drag.id !== event.pointerId) return;
        if (!drag.active) {
          const dx = Math.abs(event.clientX - drag.startX);
          const dy = Math.abs(event.clientY - drag.startY);
          if (dy > dx && dy > 6) { drag = null; stop(); return; }
          if (dx < 6 || dx <= dy) return;
          // Do not capture a finger until it intends to rotate horizontally.
          // Vertical swipes and pinch zoom remain native page gestures.
          drag.active = true;
          canvas.setPointerCapture(event.pointerId);
          canvas.classList.add('pointer-focused');
          canvas.focus({preventScroll: true});
          section.classList.add('orbit-explored');
        }
        const change = (drag.x - event.clientX) / Math.max(width, 1) * count;
        const dt = Math.max(.008, (event.timeStamp - drag.time) / 1000);
        position += change;
        velocity = reduced.matches ? 0 : Math.max(-count * .65, Math.min(count * .65, change / dt));
        drag.x = event.clientX;
        drag.time = event.timeStamp;
        // Pointer events can arrive faster than the display refresh rate.
        wake();
      }, {passive: true});
      function release(event) {
        if (!drag || drag.id !== event.pointerId) return;
        if (!drag.active || event.type !== 'pointerup' || event.timeStamp - drag.time > 100 || reduced.matches) stop();
        drag = null;
        last = 0;
        wake();
      }
      canvas.addEventListener('pointerup', release);
      canvas.addEventListener('pointercancel', release);
      canvas.addEventListener('lostpointercapture', release);
      canvas.addEventListener('pointerleave', () => { if (drag && !drag.active) { drag = null; stop(); } });
      canvas.addEventListener('keydown', event => {
        canvas.classList.remove('pointer-focused');
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          section.classList.add('orbit-explored');
          stop();
          position += event.key === 'ArrowRight' ? -1 : 1;
          wake();
        } else if (event.key === 'Home') {
          event.preventDefault();
          stop();
          position = 0;
          wake();
          status.textContent = 'Hat returned to the front.';
        }
      });
      new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        section.classList.toggle('orbit-visible', visible && !document.hidden);
        last = 0;
        if (!visible) suspend();
        else wake();
      }).observe(stage);
      document.addEventListener('visibilitychange', () => {
        section.classList.toggle('orbit-visible', visible && !document.hidden);
        if (document.hidden) suspend();
        else wake();
      });
      reduced.addEventListener('change', () => {
        if (reduced.matches) { stop(); wake(); }
      });
      toolbar.hidden = false;
      section.querySelector('#orbit-instructions').hidden = false;
      resize();
      draw();
      section.classList.add('orbit-ready', 'photo-spin');
      status.textContent = '360-degree AI hat preview ready. Drag left or right to explore.';
    } catch (error) {
      host.replaceChildren();
      toolbar.hidden = true;
      status.textContent = 'The hat photo is shown. The rotation could not load. You can retry below.';
      // Both decode workers have settled before another attempt can begin.
      requested = false;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'orbit-retry';
      retry.textContent = 'Retry rotation';
      retry.addEventListener('click', load, {once: true});
      stage.append(retry);
      console.warn('Hat sequence:', error.message);
    } finally {
      loading?.remove();
      stage.removeAttribute('aria-busy');
    }
  }
  function prepare() {
    // The photo story is far below the first screen. Loading after the entrance
    // alone still competes with scrolling and decodes every frame unnecessarily.
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      load();
    }, {rootMargin: '600px 0px'});
    observer.observe(stage);
  }
  if (document.documentElement.classList.contains('intro-pending')) {
    document.addEventListener('ln:intro-complete', prepare, {once: true});
  } else prepare();
})();
