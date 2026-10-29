/* Let the browser anchor the travelling card. JavaScript only decides when
   it reaches the document's parking boundary; it never chases scroll/chrome
   motion with a calculated top, viewport-height value or translation. */
(() => {
  'use strict';
  const card = document.querySelector('.shop-card');
  const track = card?.closest('.shop-track');
  if (!card || !track) return;
  const mobile = matchMedia('(max-width:700px)');
  // A zero-height fixed ruler shares the card's native bottom edge. This
  // works with app/browser-owned toolbars without guessing their placement.
  const edge = document.createElement('div');
  edge.className = 'mobile-card-edge';
  edge.setAttribute('aria-hidden', 'true');
  document.body.append(edge);
  let frame = 0, bagOpen = false, lastMode = '';
  function update() {
    frame = 0;
    if (!mobile.matches) {
      delete card.dataset.mobilePosition;
      lastMode = '';
      return;
    }
    // A drawer fixes the body temporarily; it is not a parking transition.
    if (bagOpen || document.documentElement.hasAttribute('data-journey-bag-open')) return;
    const bounds = track.getBoundingClientRect();
    const bottom = edge.getBoundingClientRect().top;
    const top = bottom - card.offsetHeight;
    const mode = bottom >= bounds.bottom ? 'parked'
      : top < bounds.top ? 'before' : 'floating';
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
  addEventListener('pageshow', schedule);
  screen.orientation?.addEventListener('change', schedule);
  window.visualViewport?.addEventListener('resize', schedule, {passive:true});
  window.visualViewport?.addEventListener('scroll', schedule, {passive:true});
  mobile.addEventListener('change', schedule);
  document.addEventListener('ln:bag-visibility', event => {
    bagOpen = event.detail.open;
    if (!bagOpen) schedule();
  });
  const observer = new ResizeObserver(schedule);
  observer.observe(card);
  observer.observe(track);
  // Position it before the opening animation reads the hat's destination.
  update();
})();
