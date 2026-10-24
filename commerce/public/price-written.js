(() => {
  'use strict';
  // Outlined from the bundled Barlow Condensed ExtraBold font (OFL). These
  // solid letterforms need no font download; animated masks retain the reveal.
  const shapes = {
    dollar: 'M28.432 54.128Q28.112 54.256 28.112 54.512L28.24 57.84Q28.24 58.16 28.016 58.384Q27.792 58.608 27.472 58.608H21.136Q20.816 58.608 20.592 58.384Q20.368 58.16 20.368 57.84L20.432 54.256Q20.432 54 20.176 53.936Q16.208 52.784 13.936 49.744Q11.664 46.704 11.664 42.608V40.624Q11.664 40.304 11.888 40.08Q12.112 39.856 12.432 39.856H21.392Q21.712 39.856 21.936 40.08Q22.16 40.304 22.16 40.624V42.096Q22.16 43.632 22.896 44.528Q23.632 45.424 24.784 45.424Q25.936 45.424 26.672 44.56Q27.408 43.696 27.408 42.352Q27.408 40.88 26.256 39.696Q25.104 38.512 21.648 36.016Q18.448 33.712 16.4 31.888Q14.352 30.064 12.88 27.344Q11.408 24.624 11.408 21.04Q11.408 16.624 13.776 13.456Q16.144 10.288 20.24 9.2Q20.496 9.136 20.496 8.88L20.432 4.784Q20.432 4.464 20.656 4.24Q20.88 4.016 21.2 4.016H27.408Q27.728 4.016 27.952 4.24Q28.176 4.464 28.176 4.784L28.112 8.752Q28.112 9.072 28.368 9.136Q32.656 10.224 35.12 13.424Q37.584 16.624 37.584 21.232V22.768Q37.584 23.088 37.36 23.312Q37.136 23.536 36.816 23.536H27.92Q27.6 23.536 27.376 23.312Q27.152 23.088 27.152 22.768V20.976Q27.152 19.568 26.384 18.672Q25.616 17.776 24.464 17.776Q23.312 17.776 22.608 18.672Q21.904 19.568 21.904 21.04Q21.904 22.64 22.992 23.92Q24.08 25.2 27.408 27.632Q31.44 30.64 33.488 32.496Q35.536 34.352 36.688 36.624Q37.84 38.896 37.84 41.968Q37.84 46.704 35.312 49.936Q32.784 53.168 28.432 54.128Z',
    three: 'M66.064 39.6Q66.064 41.072 65.936 43.76Q65.68 48.624 62.288 51.568Q58.896 54.512 53.392 54.512Q49.616 54.512 46.672 53.136Q43.728 51.76 42.064 49.264Q40.4 46.768 40.336 43.568Q40.208 41.392 40.208 40.176Q40.208 39.408 40.976 39.408H50.064Q50.832 39.408 50.832 40.176Q50.832 41.072 50.96 42.48Q51.088 43.824 51.728 44.592Q52.368 45.36 53.392 45.36Q54.416 45.36 55.088 44.624Q55.76 43.888 55.888 42.608Q55.952 41.2 55.952 38.448Q55.952 35.632 55.824 34.352Q55.76 33.136 55.088 32.4Q54.416 31.664 53.392 31.664Q52.368 31.664 51.216 32.688Q50.96 32.944 50.704 32.944Q50.512 32.944 50.128 32.688L45.456 27.824Q45.2 27.44 45.2 27.248Q45.2 26.992 45.456 26.736L53.008 18.608Q53.264 18.224 52.88 18.224H41.872Q41.552 18.224 41.328 18Q41.104 17.776 41.104 17.456V9.968Q41.104 9.648 41.328 9.424Q41.552 9.2 41.872 9.2H65.232Q65.552 9.2 65.776 9.424Q66 9.648 66 9.968V17.712Q66 18.224 65.616 18.608L58.704 26.608Q58.448 26.992 58.832 26.992Q61.712 27.184 63.696 29.68Q65.68 32.176 65.872 35.696Q66.064 37.616 66.064 39.6Z',
    zero: 'M69.072 41.264V21.936Q69.072 15.856 72.656 12.144Q76.24 8.432 82.192 8.432Q88.144 8.432 91.728 12.144Q95.312 15.856 95.312 21.936V41.264Q95.312 47.344 91.728 51.056Q88.144 54.768 82.192 54.768Q76.24 54.768 72.656 51.056Q69.072 47.344 69.072 41.264ZM84.688 41.904V21.296Q84.688 19.632 84.016 18.608Q83.344 17.584 82.192 17.584Q81.04 17.584 80.368 18.608Q79.696 19.632 79.696 21.296V41.904Q79.696 43.568 80.368 44.592Q81.04 45.616 82.192 45.616Q83.344 45.616 84.016 44.592Q84.688 43.568 84.688 41.904Z',
  };
  let instance = 0;
  function createMarkup() {
    const id = `bold-price-${++instance}`;
    return `<svg class="written-mark price-lettering" viewBox="0 0 108 64" aria-hidden="true" focusable="false"><defs><mask id="${id}-dollar" maskUnits="userSpaceOnUse" x="0" y="0" width="108" height="64"><path class="price-reveal written-dollar" pathLength="1" d="M32 21C32 9 17 9 17 21C17 31 32 31 32 42C32 54 17 54 17 41"/><path class="price-reveal dollar-stem" pathLength="1" d="M24.3 4V59"/></mask><mask id="${id}-three" maskUnits="userSpaceOnUse" x="0" y="0" width="108" height="64"><path class="price-reveal written-three" pathLength="1" d="M45 14H60L50 27C63 26 61 31 61 39Q61 50 53 50Q45 50 45 41"/></mask><mask id="${id}-zero" maskUnits="userSpaceOnUse" x="0" y="0" width="108" height="64"><path class="price-reveal written-zero" pathLength="1" d="M82.2 13C76 13 74.4 17 74.4 22V41C74.4 48 78.2 50 82.2 50C88.2 50 90 46 90 41V22C90 16 86 13 82.2 13"/></mask></defs><path class="price-glyph" d="${shapes.dollar}" mask="url(#${id}-dollar)"/><path class="price-glyph" d="${shapes.three}" mask="url(#${id}-three)"/><path class="price-glyph" d="${shapes.zero}" mask="url(#${id}-zero)"/></svg>`;
  }
  // Each copy has its own masks, so the lab and its comparison cards never
  // borrow a hidden or animating mask from another copy of the price.
  window.LosNinosPriceLettering = Object.freeze({ createMarkup, get markup() { return createMarkup(); } });
  if (document.documentElement.dataset.priceTreatment !== 'written') return;
  const mark = document.querySelector('.purchase-price');
  const value = mark?.querySelector('[data-product-price]');
  if (!mark || !value) return;
  mark.insertAdjacentHTML('beforeend', createMarkup());
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
