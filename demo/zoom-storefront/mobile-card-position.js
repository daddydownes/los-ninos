/* Keep the phone purchase card independent of the root sticky scrollport.
   Only the terminal state belongs to the document; the travelling state uses
   a frozen visual-viewport offset, with no easing or scroll-follow transform. */
(() => {
  'use strict';
  const card = document.querySelector('.shop-card');
  const track = card?.closest('.shop-track');
  if (!card || !track) return;
  const mobile = matchMedia('(max-width:700px)');
  const viewport = window.visualViewport;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;pointer-events:none;visibility:hidden;width:0;height:100svh;padding-bottom:env(safe-area-inset-bottom);box-sizing:content-box;top:0;left:0;';
  document.body.append(probe);
  let frame = 0, anchor = 0, measuredWidth = 0, measuredHeight = 0, bagOpen = false;
  let lastTop = '', lastMode = '';

  function update() {
    frame = 0;
    if (!mobile.matches) {
      delete card.dataset.mobilePosition;
      card.style.removeProperty('--mobile-card-top');
      measuredWidth = measuredHeight = 0;
      lastMode = lastTop = '';
      return;
    }
    // The drawer temporarily fixes the body. Its coordinate system is not
    // a new page layout, and must not change the anchor or parking state.
    if (bagOpen || document.documentElement.hasAttribute('data-journey-bag-open')) return;
    const width = document.documentElement.clientWidth;
    const height = card.offsetHeight;
    if (width !== measuredWidth || height !== measuredHeight) {
      const style = getComputedStyle(probe);
      const smallHeight = parseFloat(style.height) || window.innerHeight;
      const inset = parseFloat(style.paddingBottom) || 0;
      anchor = Math.max(0, smallHeight - height - 14 - inset);
      measuredWidth = width;
      measuredHeight = height;
    }
    // Do not drag the card after the user's pinch-zoom pan or keyboard focus.
    // At normal scale compensate only the actual reported viewport offset;
    // never infer an Apple/Samsung toolbar height from viewport size.
    const focused = document.activeElement;
    const editing = focused?.matches('input,textarea,select,[contenteditable="true"]');
    const offset = viewport && Math.abs(viewport.scale - 1) < .01 && !editing
      ? Math.max(0, viewport.offsetTop) : 0;
    const top = anchor + offset;
    const bounds = track.getBoundingClientRect();
    const mode = top + height >= bounds.bottom ? 'parked'
      : top < bounds.top ? 'before' : 'floating';
    const value = top + 'px';
    if (value !== lastTop) {
      card.style.setProperty('--mobile-card-top', value);
      lastTop = value;
    }
    if (mode !== lastMode) {
      card.dataset.mobilePosition = mode;
      lastMode = mode;
    }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  addEventListener('scroll', schedule, {passive:true});
  addEventListener('resize', schedule, {passive:true});
  addEventListener('pageshow', () => { measuredWidth = 0; schedule(); });
  screen.orientation?.addEventListener('change', () => { measuredWidth = 0; schedule(); });
  viewport?.addEventListener('resize', schedule, {passive:true});
  viewport?.addEventListener('scroll', schedule, {passive:true});
  mobile.addEventListener('change', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  document.addEventListener('ln:bag-visibility', event => {
    bagOpen = event.detail.open;
    if (!bagOpen) schedule();
  });
  const observer = new ResizeObserver(schedule);
  observer.observe(card);
  observer.observe(track);
  // Run before the opening animation reads the hat's destination.
  update();
})();
