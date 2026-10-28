/* The original photographic hat views, interpolated offline into one video. */
(() => {
  'use strict';
  const section = document.querySelector('[data-orbit]');
  if (!section) return;
  const stage = section.querySelector('[data-orbit-stage]');
  const host = section.querySelector('[data-orbit-canvas]');
  const status = section.querySelector('[data-orbit-status]');
  if (!stage || !host || !status) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 700px), (pointer: coarse)');
  const motionPreview = document.querySelector('[data-motion-preview]');
  const reduced = () => motion.matches || !!motionPreview?.checked;
  const radius = 1.1624, bottom = 1.2228739002932552;
  const posterURL = new URL('/rotation-assets/photo-turn-poster.webp', document.baseURI).href;
  const toolbar = section.querySelector('.orbit-toolbar');
  const slider = section.querySelector('[data-orbit-slider]');
  const instructions = section.querySelector('#orbit-instructions');
  if (toolbar) toolbar.hidden = true;
  if (slider) slider.disabled = true;
  if (instructions) instructions.hidden = true;

  let current = null, nextID = 0, loadingOwner = 0;
  let visible = false, prepared = false, poster = null, canvas = null, ctx = null;
  const sourcePaper = new WeakMap();
  let appliedPaper = '';
  function paperFor(source) {
    if (sourcePaper.has(source)) return sourcePaper.get(source);
    const sample = document.createElement('canvas');
    sample.width = sample.height = 1;
    const sampleContext = sample.getContext('2d', {willReadFrequently: true});
    sampleContext.drawImage(source, 0, 0, 1, 1, 0, 0, 1, 1);
    const pixel = sampleContext.getImageData(0, 0, 1, 1).data;
    const paper = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
    sourcePaper.set(source, paper);
    return paper;
  }

  function setState(state, running = false) {
    section.dataset.rotationState = state;
    section.classList.toggle('orbit-visible', visible && !document.hidden);
    if (!canvas) return;
    canvas.dataset.state = state;
    canvas.dataset.running = String(running);
  }
  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d', {alpha: false});
    if (!ctx) { canvas = null; throw new Error('Canvas unavailable'); }
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Automatically rotating photographic view of the OG Snapback');
    canvas.dataset.renderer = 'photographic-video';
    canvas.dataset.state = section.dataset.rotationState || 'loading';
    canvas.dataset.running = 'false';
    canvas.dataset.frame = '0';
    canvas.dataset.time = '0.000';
    Object.assign(canvas.style, {position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '1', touchAction: 'pan-y'});
  }
  function draw(source, sourceWidth, sourceHeight, mediaTime = 0) {
    if (!ctx || !sourceWidth || !sourceHeight) return;
    // Both videos and the poster have the same fixed crown registration.
    // 1440/540 and 960/360 are the same source-width / crown-height ratio.
    const sourceCrown = sourceWidth * 540 / 1440;
    const crownPixels = Math.min(canvas.width * .46 / radius, canvas.height * .62 / bottom);
    const scale = crownPixels / sourceCrown;
    const width = sourceWidth * scale, height = sourceHeight * scale;
    // WebP/H.264 rounding can shift a flat background by a colour value.
    // Match the decoded asset's paper so its rectangular boundary never shows.
    const paper = paperFor(source);
    if (paper !== appliedPaper) {
      appliedPaper = paper;
      const surround = section.closest('#worn') || section.closest('#test-area');
      if (surround) surround.style.backgroundColor = paper;
      stage.style.backgroundColor = paper;
    }
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    const time = Math.max(0, mediaTime || 0);
    canvas.dataset.frame = String(Math.floor((time % 8) * 30 + .001) % 240);
    canvas.dataset.time = time.toFixed(3);
  }
  function drawPoster() {
    if (poster) draw(poster, poster.naturalWidth, poster.naturalHeight);
  }
  function resize() {
    if (!canvas) return;
    const rect = stage.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width; canvas.height = height;
    const s = current;
    if (!reduced() && s?.mediaReady && !s.autoplayBlocked && s.video.readyState >= 2) {
      draw(s.video, s.video.videoWidth, s.video.videoHeight, s.video.currentTime);
    } else drawPoster();
  }
  const valid = s => current === s && !s.disposed;
  const shouldRun = s => valid(s) && visible && !document.hidden && !reduced();

  function showLoading(s) {
    if (s.loading || !valid(s)) return;
    s.loading = document.createElement('div');
    s.loading.className = 'spin-loading';
    s.loading.textContent = 'Loading the 360Â° previewâ€¦';
    stage.append(s.loading);
    loadingOwner = s.id;
    stage.setAttribute('aria-busy', 'true');
    status.textContent = 'Loading the 360-degree preview.';
    setState('loading');
  }
  function finishLoading(s) {
    s.loading?.remove(); s.loading = null;
    if (loadingOwner !== s.id) return;
    loadingOwner = 0;
    stage.removeAttribute('aria-busy');
  }
  function cancelFrame(s) {
    if (s.callback !== null) {
      if (s.callbackType === 'video') s.video.cancelVideoFrameCallback(s.callback);
      else cancelAnimationFrame(s.callback);
    }
    s.callback = null;
  }
  function clearStall(s) { clearTimeout(s.stallTimer); s.stallTimer = 0; }
  function pause(s) {
    cancelFrame(s); clearStall(s);
    s.playEpoch++; s.playPending = false;
    s.video?.pause();
  }
  function cleanup(s) {
    if (s.disposed) return;
    s.disposed = true;
    pause(s); s.events.abort(); finishLoading(s);
    if (s.video) {
      s.video.removeAttribute('src');
      s.video.load();
      s.video.remove();
    }
  }
  function retryButton(label, action) {
    section.querySelector('.orbit-retry')?.remove();
    const button = document.createElement('button');
    button.className = 'orbit-retry'; button.type = 'button'; button.textContent = label;
    button.addEventListener('click', action, {once: true});
    stage.append(button);
  }
  function fail(s, error) {
    if (!valid(s)) return;
    current = null;
    cleanup(s);
    drawPoster();
    if (!poster) {
      host.replaceChildren();
      section.classList.remove('orbit-ready', 'photo-spin', 'continuous-rotation');
    }
    setState('error');
    status.textContent = 'The hat photo is shown. The rotation could not load. You can retry below.';
    retryButton('Retry rotation', load);
    console.warn('Photo rotation:', error?.message || 'Media unavailable');
  }

  function waitFor(target, eventName, ready, signal, message) {
    return new Promise((resolve, reject) => {
      let timer;
      const finish = error => {
        clearTimeout(timer);
        target.removeEventListener(eventName, loaded);
        target.removeEventListener('error', failed);
        signal.removeEventListener('abort', aborted);
        if (error) reject(error); else resolve();
      };
      const loaded = () => { if (ready()) finish(); };
      const failed = () => finish(new Error(message));
      const aborted = () => finish(new DOMException('Loading cancelled', 'AbortError'));
      target.addEventListener(eventName, loaded);
      target.addEventListener('error', failed);
      signal.addEventListener('abort', aborted, {once: true});
      timer = setTimeout(() => finish(new Error(message + ' (timed out)')), 20000);
      if (signal.aborted) aborted(); else if (ready()) loaded();
    });
  }
  function schedule(s) {
    if (!shouldRun(s) || !s.mediaReady || s.video.paused || s.callback !== null) return;
    const paint = (_time, metadata) => {
      s.callback = null;
      if (!shouldRun(s) || s.video.paused) return;
      if (s.video.readyState >= 2) {
        const mediaTime = metadata?.mediaTime ?? s.video.currentTime;
        if (mediaTime !== s.lastDrawnTime) {
          draw(s.video, s.video.videoWidth, s.video.videoHeight, mediaTime);
          s.lastDrawnTime = mediaTime;
        }
      }
      schedule(s);
    };
    if (typeof s.video.requestVideoFrameCallback === 'function' && typeof s.video.cancelVideoFrameCallback === 'function') {
      s.callbackType = 'video'; s.callback = s.video.requestVideoFrameCallback(paint);
    } else {
      s.callbackType = 'raf'; s.callback = requestAnimationFrame(paint);
    }
  }
  function start(s, userGesture = false) {
    if (!shouldRun(s) || !s.mediaReady || s.playPending || (s.autoplayBlocked && !userGesture)) return;
    if (userGesture) {
      s.autoplayBlocked = false;
      section.querySelector('.orbit-retry')?.remove();
    }
    if (!s.video.paused) { setState('playing', true); schedule(s); return; }
    const epoch = ++s.playEpoch;
    s.playPending = true;
    // Calling play directly inside the retry click preserves its user activation.
    let result;
    try { result = s.video.play(); }
    catch (error) { result = Promise.reject(error); }
    Promise.resolve(result).then(() => {
      if (!valid(s) || epoch !== s.playEpoch) return;
      s.playPending = false;
      if (!shouldRun(s)) { pause(s); return; }
      clearStall(s); setState('playing', true); schedule(s);
      status.textContent = '360-degree hat preview ready.';
    }).catch(error => {
      if (!valid(s) || epoch !== s.playEpoch) return;
      s.playPending = false;
      if (!shouldRun(s)) return;
      if (error.name === 'NotAllowedError') {
        pause(s); s.autoplayBlocked = true; drawPoster();
        setState('awaiting-play');
        status.textContent = 'The hat photo is shown. Select Play rotation to start the preview.';
        retryButton('Play rotation', () => start(s, true));
      } else fail(s, error);
    });
  }
  async function prepareVideo(s) {
    if (s.preparing || s.mediaReady || !valid(s)) return;
    s.preparing = true;
    showLoading(s);
    const video = document.createElement('video');
    s.video = video;
    video.muted = true; video.defaultMuted = true; video.volume = 0;
    video.loop = true; video.playsInline = true; video.preload = 'auto';
    video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true'); video.tabIndex = -1;
    video.disablePictureInPicture = true;
    // Keep the decoding video in the document under the opaque canvas.
    Object.assign(video.style, {position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', zIndex: '0'});
    const source = compact.matches ? 'photo-turn-mobile.mp4' : 'photo-turn-hd.mp4';
    canvas.dataset.source = source;
    host.replaceChildren(video, canvas);
    const signal = s.events.signal;
    video.addEventListener('error', () => fail(s, new Error('Video unavailable')), {signal});
    const buffering = () => {
      if (!shouldRun(s) || !s.mediaReady) return;
      setState('buffering', true);
      if (!s.stallTimer) s.stallTimer = setTimeout(() => fail(s, new Error('Video playback timed out')), 25000);
    };
    video.addEventListener('waiting', buffering, {signal});
    video.addEventListener('stalled', buffering, {signal});
    video.addEventListener('playing', () => {
      if (!shouldRun(s)) { video.pause(); return; }
      clearStall(s); setState('playing', true); schedule(s);
    }, {signal});
    try {
      video.src = new URL('/rotation-assets/' + source, document.baseURI).href;
      video.load();
      await waitFor(video, 'loadeddata', () => video.readyState >= 2 && video.videoWidth > 0, signal, 'Video unavailable');
      if (!valid(s)) return;
      s.mediaReady = true; s.preparing = false;
      finishLoading(s);
      status.textContent = '360-degree hat preview ready.';
      sync();
    } catch (error) { if (valid(s)) fail(s, error); }
  }
  function sync() {
    const s = current;
    section.classList.toggle('orbit-visible', visible && !document.hidden);
    if (!s || !poster) return;
    if (reduced()) {
      pause(s); drawPoster(); finishLoading(s);
      section.querySelector('.orbit-retry')?.remove();
      canvas.setAttribute('aria-label', 'Front view of the OG Snapback');
      setState('reduced-motion');
      status.textContent = 'Hat photo shown with reduced motion.';
      return;
    }
    canvas.setAttribute('aria-label', 'Automatically rotating photographic view of the OG Snapback');
    if (!s.mediaReady) { showLoading(s); prepareVideo(s); return; }
    if (!visible || document.hidden) { pause(s); setState('paused'); return; }
    if (s.autoplayBlocked) {
      drawPoster(); setState('awaiting-play');
      retryButton('Play rotation', () => start(s, true));
    } else start(s);
  }
  async function load() {
    if (current) return;
    const s = {id: ++nextID, events: new AbortController(), disposed: false, video: null, preparing: false, mediaReady: false, callback: null, callbackType: '', playEpoch: 0, playPending: false, autoplayBlocked: false, lastDrawnTime: -1, stallTimer: 0, loading: null};
    current = s;
    section.querySelector('.orbit-retry')?.remove();
    showLoading(s);
    try {
      ensureCanvas();
      if (!poster) {
        const image = new Image(); image.decoding = 'async';
        image.src = posterURL;
        await waitFor(image, 'load', () => image.complete && image.naturalWidth > 0, s.events.signal, 'Preview photo unavailable');
        if (!valid(s)) return;
        poster = image;
      }
      if (!valid(s)) return;
      host.replaceChildren(canvas); resize(); drawPoster();
      section.classList.add('orbit-ready', 'photo-spin');
      section.classList.remove('continuous-rotation');
      sync();
    } catch (error) { if (valid(s)) fail(s, error); }
  }
  function prepare() {
    if (prepared) return;
    prepared = true;
    // Observers and preference listeners belong to the section, never a retry.
    new ResizeObserver(resize).observe(stage);
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio > 0;
      sync();
    }, {threshold: [0, 0.001]}).observe(stage);
    motion.addEventListener('change', sync);
    motionPreview?.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    const loader = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      loader.disconnect(); load();
    }, {rootMargin: '600px 0px'});
    loader.observe(stage);
  }
  if (document.documentElement.classList.contains('intro-pending')) document.addEventListener('ln:intro-complete', prepare, {once: true});
  else prepare();
})();
