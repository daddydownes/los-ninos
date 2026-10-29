(() => {
  'use strict';
  // Opt-in only: no elements, observers, timers or listeners on normal visits.
  if (new URL(location.href).searchParams.get('debug') !== 'bag') return;
  const card = document.querySelector('.shop-card');
  const track = document.querySelector('.shop-track');
  const coin = document.querySelector('.brandbar .bag-open');
  if (!card || !track || !coin) return;

  const version = selector => {
    const element = document.querySelector(selector);
    const address = element?.src || element?.href;
    return address ? new URL(address).searchParams.get('v') || 'unversioned' : 'missing';
  };
  const build = {
    motion: version('script[src*="film-motion.js"]'),
    style: version('link[href*="zoom.css"]'),
    diagnostics: version('script[src*="mobile-bag-debug.js"]')
  };
  const started = performance.now(), samples = [], reasons = new Set();
  let frame = 0, stopped = false;
  const viewport = window.visualViewport;
  const host = document.createElement('div');
  host.id = 'mobile-bag-debug';
  host.style.cssText = 'position:fixed;top:max(86px,calc(env(safe-area-inset-top) + 70px));right:8px;z-index:2147483000;pointer-events:none;width:min(270px,calc(100vw - 16px))';
  const shadow = host.attachShadow({mode: 'open'});
  shadow.innerHTML = `<style>
    :host{color-scheme:dark}*{box-sizing:border-box}
    section{padding:9px;border:1px solid #91c9e8;border-radius:8px;background:#08131af0;color:#eff8ff;font:11px/1.4 ui-monospace,monospace;box-shadow:0 2px 12px #0004}
    strong{display:block;font-size:11px}pre{margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}
    nav{display:flex;gap:8px}button,textarea{pointer-events:auto;font:inherit;color:#eff8ff;background:#19384a;border:1px solid #91c9e8;border-radius:4px}
    button{min-height:32px;padding:5px 8px;cursor:pointer}textarea{width:100%;height:130px;margin-top:7px;resize:vertical}
    p{margin:5px 0 0;font-size:10px}[hidden]{display:none!important}
  </style><section aria-label="Optional bag position diagnostics">
    <strong>Bag diagnostics · CSS pixels</strong><pre></pre>
    <nav><button type="button" data-copy>Copy report</button><button type="button" data-close>Close</button></nav>
    <p role="status"></p><textarea hidden readonly aria-label="Diagnostic report; select and copy"></textarea>
  </section>`;
  document.body.append(host);
  const output = shadow.querySelector('pre'), status = shadow.querySelector('[role="status"]');
  const fallback = shadow.querySelector('textarea');
  const rounded = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const rectangle = element => {
    const rect = element.getBoundingClientRect();
    return Object.fromEntries(['top', 'bottom', 'left', 'right', 'width', 'height'].map(key => [key, rounded(rect[key])]));
  };
  function sample() {
    frame = 0;
    if (stopped) return;
    const cardRect = rectangle(card), trackRect = rectangle(track), coinRect = rectangle(coin);
    const cardStyle = getComputedStyle(card), anchor = card.style.getPropertyValue('--mobile-card-top');
    // The parked card's computed top is relative to its track. Keep boundary
    // clearance relative to the controller's intended viewport anchor instead.
    const anchorInset = parseFloat(anchor);
    const inset = Number.isFinite(anchorInset) ? anchorInset : parseFloat(cardStyle.top) || 0;
    const offset = viewport?.offsetTop || 0;
    const clearance = trackRect.bottom - inset - cardRect.height;
    const entry = {
      ms: rounded(performance.now() - started), reason: [...reasons].join(','),
      scrollY: rounded(window.scrollY), innerHeight: window.innerHeight,
      viewport: {offsetTop: rounded(offset), height: rounded(viewport?.height ?? innerHeight), scale: rounded(viewport?.scale ?? 1)},
      card: {...cardRect, visualTop: rounded(cardRect.top - offset), stickyInset: cardStyle.top, anchorVariable: anchor, position: cardStyle.position},
      trackBottom: trackRect.bottom, boundaryClearance: rounded(clearance),
      state: card.dataset.mobilePosition || (clearance <= 1 ? 'at/past boundary' : clearance < 80 ? 'near boundary' : 'floating'),
      coin: {...coinRect, visualTop: rounded(coinRect.top - offset)},
      bodyPosition: getComputedStyle(document.body).position,
      bagOpen: document.documentElement.hasAttribute('data-journey-bag-open')
    };
    reasons.clear(); samples.push(entry); if (samples.length > 180) samples.shift();
    output.textContent = `build ${build.motion}\ncard layout ${entry.card.top} · visual ${entry.card.visualTop}\ninset ${entry.card.stickyInset} · anchor ${entry.card.anchorVariable || 'none'}\nviewport offset ${entry.viewport.offsetTop}\nheight ${entry.viewport.height} · scale ${entry.viewport.scale}\ntrack bottom ${entry.trackBottom}\n${entry.state} · clearance ${entry.boundaryClearance}\ncoin layout ${entry.coin.top} · visual ${entry.coin.visualTop}\nscroll ${entry.scrollY} · body ${entry.bodyPosition}\nsamples ${samples.length}/180`;
  }
  function schedule(event) {
    if (stopped) return;
    reasons.add(typeof event === 'string' ? event : event.type);
    if (!frame) frame = requestAnimationFrame(sample);
  }
  const listeners = [];
  function listen(target, type) {
    if (!target) return;
    target.addEventListener(type, schedule, {passive: true});
    listeners.push([target, type]);
  }
  for (const type of ['scroll', 'resize', 'pageshow', 'orientationchange']) listen(window, type);
  for (const type of ['scroll', 'resize']) listen(viewport, type);
  for (const type of ['ln:bag-visibility', 'ln:intro-complete', 'focusin', 'focusout']) listen(document, type);
  const observer = new ResizeObserver(() => schedule('element-resize'));
  for (const element of [card, track, coin]) observer.observe(element);
  const report = () => JSON.stringify({
    note: 'CSS layout/visual viewport measurements, not physical screen coordinates. No data was uploaded.',
    build, page: location.origin + location.pathname, userAgent: navigator.userAgent,
    devicePixelRatio, screen: {width: screen.width, height: screen.height, orientation: screen.orientation?.type || 'unavailable'},
    samples: samples.slice()
  }, null, 2);
  shadow.querySelector('[data-copy]').addEventListener('click', async () => {
    const text = report();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      fallback.hidden = true; status.textContent = 'Report copied. Nothing was uploaded.';
    } catch (_) {
      fallback.hidden = false; fallback.value = text; fallback.focus(); fallback.select();
      status.textContent = 'Select and copy the report below. Nothing was uploaded.';
    }
  });
  shadow.querySelector('[data-close]').addEventListener('click', () => {
    stopped = true; cancelAnimationFrame(frame); observer.disconnect();
    for (const [target, type] of listeners) target.removeEventListener(type, schedule);
    host.remove();
  });
  schedule('initial');
})();
