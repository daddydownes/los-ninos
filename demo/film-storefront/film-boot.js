(() => {
  const root = document.documentElement;
  const navigation = performance.getEntriesByType('navigation')[0]?.type;
  const address = new URL(location.href);
  const checkoutReturn = navigation !== 'reload' && address.searchParams.get('return') === 'shop';
  if (address.searchParams.has('return')) {
    address.searchParams.delete('return');
    history.replaceState(history.state, '', address);
  }
  window.lnSkipIntro = checkoutReturn || navigation === 'back_forward' || matchMedia('(prefers-reduced-motion:reduce)').matches;
  history.scrollRestoration = window.lnSkipIntro ? 'auto' : 'manual';
  if (!window.lnSkipIntro) {
    if (navigation === 'reload' && history.state?.lnBag) {
      const state = { ...history.state };
      delete state.lnBag;
      history.replaceState(state, '', location.href);
    }
    if (navigation === 'reload' && location.hash) history.replaceState(history.state, '', location.pathname + location.search);
    window.scrollTo(0, 0);
    root.classList.add('intro-pending');
  }
  // Independent of the animation bundle, so missing assets cannot trap the page.
  window.lnFilmGuard = setTimeout(() => {
    const incomplete = document.querySelector('.scene')?.dataset.openingPhase !== 'complete';
    if (incomplete) {
      root.classList.add('film-static');
      const quantity = window.LosNinosBag?.getQuantity() || 1;
      const link = document.querySelector('.film-fallback-link');
      if (link) link.href = 'checkout.html?quantity=' + quantity;
    }
    root.classList.remove('intro-pending', 'opening-settling');
    root.classList.add('intro-complete');
    document.querySelectorAll('.product-interface,.shop-card,.brandbar').forEach(el => { el.inert = false; });
    window.lnSkipIntro = true;
    document.dispatchEvent(new Event('ln:intro-complete'));
  }, 10000);
})();
