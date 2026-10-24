(() => {
  'use strict';
  // Shared lettering keeps the isolated study and the complete opening identical.
  const markup = '<svg class="written-mark price-lettering" viewBox="0 0 170 82" aria-hidden="true" focusable="false"><path class="written-dollar" pathLength="1" d="M36 23C28 16 15 18 13 28C11 39 31 36 34 46C37 59 19 65 10 56"/><path class="dollar-stem" pathLength="1" d="M28 12 20 70"/><path class="written-three" pathLength="1" d="M63 24C75 15 96 16 97 28C98 37 85 41 76 41C89 38 102 45 96 55C89 68 68 68 60 59"/><path class="written-zero" pathLength="1" d="M137 20C121 17 111 36 110 51C109 64 122 69 133 62C145 55 153 29 145 22C143 20 140 20 137 20"/></svg>';
  window.LosNinosPriceLettering = Object.freeze({ markup });
  if (document.documentElement.dataset.priceTreatment !== 'written') return;
  const mark = document.querySelector('.purchase-price');
  const value = mark?.querySelector('[data-product-price]');
  if (!mark || !value) return;
  mark.insertAdjacentHTML('beforeend', markup);
  const update = () => {
    // This drawing represents $30 only. Other prices and network states retain
    // the real catalog text, so the preview cannot advertise a stale amount.
    const hand = mark.dataset.priceState === 'ready' && value.textContent.trim() === '$30';
    if (mark.dataset.handPrice !== String(hand)) mark.dataset.handPrice = String(hand);
  };
  const observer = new MutationObserver(update);
  observer.observe(mark, { attributes: true, attributeFilter: ['data-price-state'], childList: true, characterData: true, subtree: true });
  update();
})();
