(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const easing = 'cubic-bezier(.22,1,.36,1)';
  const duration = 2000;
  const designs = [
    { id: '04', key: 'baseline', name: 'Just $30', copy: 'Your reference: the original lettering and movement, with the circle removed.' },
    { id: '05', key: 'editorial', name: 'Editorial', copy: 'A larger price, a small currency sign and a measured arrival. The clearest hierarchy.' },
    { id: '06', key: 'written', name: 'Written by hand', short: 'Written', copy: 'Custom numerals draw stroke by stroke, then the arrow takes you to the button.' },
    { id: '07', key: 'woven', name: 'Satin stitch', short: 'Stitched', copy: 'Fine diagonal threads build the price from left to right, echoing the embroidery on the hat.' },
    { id: '08', key: 'studio', name: 'Studio light', short: 'Studio', copy: 'A single light passes over raised white lettering. Hover the button for a subtle change in angle.' },
    { id: '09', key: 'beside', name: 'Price + action', short: 'Together', copy: 'The price sits beside Add to bag, putting the amount and the action on one line.' },
    { id: '10', key: 'balance', name: 'Balanced', copy: 'A small invitation on the left, the price on the right. The digits settle into alignment.' },
  ];
  const pointer = '<svg class="pointer" viewBox="0 0 64 52" aria-hidden="true"><path class="pointer-stem" pathLength="1" d="M6 12H24C39 12 48 21 48 36V43"/><path class="pointer-tip" pathLength="1" d="m41 36 7 7 7-7"/></svg>';
  const button = '<button class="sample-button" type="button" aria-label="Preview Add to bag animation"><span class="button-glow" aria-hidden="true"></span><span class="button-label">Add to bag</span><span class="pocket" aria-hidden="true"><span class="plus">+</span><svg viewBox="0 0 24 24"><path d="M5 8h14l1 13H4L5 8Z M8 9V6a4 4 0 0 1 8 0v3"/></svg></span></button>';
  let prefix = 0;
  function price(key) {
    if (key === 'editorial') return '<span class="editorial-currency">$</span><span class="editorial-digits">30</span>';
    if (key === 'written') return '<svg class="written-mark" viewBox="0 0 170 82" aria-hidden="true"><path class="written-dollar" pathLength="1" d="M37 21C24 10 11 23 16 32C20 39 40 37 37 49C34 62 15 60 11 51"/><path class="dollar-stem" pathLength="1" d="M30 12 21 68"/><path class="written-three" pathLength="1" d="M66 23C84 6 107 17 98 32C94 39 85 40 78 40C97 37 106 51 92 62C84 68 67 66 61 59"/><path class="written-zero" pathLength="1" d="M139 19C117 18 105 62 128 65C147 69 162 15 140 18C134 19 130 23 127 28"/></svg>';
    if (key === 'woven') {
      const id = `woven-${++prefix}`;
      return `<svg class="woven-mark" viewBox="0 0 125 57" aria-hidden="true"><defs><linearGradient id="${id}-satin" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#e8edf2"/><stop offset=".7" stop-color="#fff"/><stop offset="1" stop-color="#d1dae5"/></linearGradient><pattern id="${id}-thread" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(34)"><path d="M.35 0V1.6" stroke="#fff" stroke-width=".4"/><path d="M1.1 0V1.6" stroke="#738195" stroke-width=".22"/></pattern><clipPath id="${id}-letters"><text x="62.5" y="44" text-anchor="middle">$30</text></clipPath></defs><g class="woven-reveal"><text class="woven-base" x="62.5" y="44" text-anchor="middle" fill="url(#${id}-satin)">$30</text><rect class="woven-thread" width="125" height="57" fill="url(#${id}-thread)" clip-path="url(#${id}-letters)"/></g></svg>`;
    }
    if (key === 'studio') return '<span class="studio-price"><span class="studio-base">$30</span><span class="studio-glint">$30</span></span>';
    return '<span class="type">$30</span>';
  }
  function designMarkup(design) {
    const value = `<span class="amount" role="img" aria-label="30 Australian dollars"><span class="price-art" aria-hidden="true">${price(design.key)}</span></span>`;
    let content;
    if (design.key === 'beside') content = `<div class="invitation"><span>Buy the hat here</span>${pointer}</div><div class="buy-row"><span class="beside-price" role="img" aria-label="30 Australian dollars"><span class="currency" aria-hidden="true">$</span><span class="digits" aria-hidden="true">30</span></span>${button}</div>`;
    else if (design.key === 'balance') content = `<div class="invitation"><span class="balance-copy"><span>Buy the hat</span><span>here.</span></span><span class="balance-price" role="img" aria-label="30 Australian dollars"><span class="currency" aria-hidden="true">$</span><span class="digit three" aria-hidden="true">3</span><span class="digit zero" aria-hidden="true">0</span></span>${pointer}</div>${button}`;
    else content = `<div class="invitation"><span class="note">Buy the hat here${value}</span>${pointer}</div>${button}`;
    return `<div class="design price-${design.key}" data-design="${design.id}">${content}</div>`;
  }
  const nav = $('.directions');
  nav.innerHTML = designs.map(design => `<button class="direction" type="button" data-option="${design.id}" aria-pressed="false" aria-label="${design.id}: ${design.name}"><span class="num">${design.id}</span><span class="name">${design.short || design.name}</span></button>`).join('');
  const comparison = $('.comparison');
  comparison.innerHTML = designs.filter(design => design.id !== '04').map(design => `<article class="compare-card" data-card="${design.id}"><header><span class="num">${design.id}</span><h3>${design.name}</h3></header>${designMarkup(design)}<p>${design.copy}</p><button class="inspect" type="button" data-inspect="${design.id}">View with the hat <span aria-hidden="true">↗</span></button></article>`).join('') + `<article class="compare-card compare-reference" data-card="04"><div><header><span class="num">04</span><h3>Your reference</h3></header><p>The original $30. Circle removed.</p><button class="inspect" type="button" data-inspect="04">View with the hat <span aria-hidden="true">↗</span></button></div>${designMarkup(designs[0])}</article>`;
  let selected = designs.find(design => design.id === location.hash.slice(1)) || designs[1];
  let animations = [];
  const comparisonAnimations = new Map();
  let animationFrame = 0;
  let slow = false;
  let paused = false;
  let current = duration;
  let clock = performance.now();
  let compareMode = false;
  let interacted = false;
  const slider = $('.timeline input');
  function animationSet(node) {
    const set = [];
    const add = (selector, frames, timing) => node.querySelectorAll(selector).forEach(element => {
      const animation = element.animate(frames, { duration: 600, fill: 'both', easing, ...timing });
      animation.pause();
      animation.currentTime = 0;
      set.push(animation);
    });
    const key = node.dataset.design;
    let arrowStart = key === '06' ? 1100 : key === '07' ? 650 : 230;
    add('.pointer-stem', [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 650, delay: arrowStart });
    add('.pointer-tip', [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 250, delay: arrowStart + 400 });
    if (key === '04') add('.type', [{ opacity: 0, transform: 'translateY(5px) rotate(5deg)' }, { opacity: 1, transform: 'none' }], { duration: 550, delay: 100 });
    if (key === '05') {
      add('.editorial-digits', [{ opacity: 0, transform: 'translateY(14px)', clipPath: 'inset(100% 0 0)' }, { opacity: 1, transform: 'none', clipPath: 'inset(0)' }], { duration: 850, delay: 70 });
      add('.editorial-currency', [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { duration: 450, delay: 350 });
    }
    if (key === '06') {
      ['.written-dollar', '.dollar-stem', '.written-three', '.written-zero'].forEach((selector, i) => add(selector, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: i === 1 ? 160 : 450, delay: [80, 280, 400, 760][i], easing: 'cubic-bezier(.35,.05,.35,1)' }));
    }
    if (key === '07') {
      add('.woven-reveal', [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0)' }], { duration: 1000, delay: 100, easing: 'steps(32,end)' });
      add('.woven-thread', [{ opacity: .25 }, { opacity: .67 }], { duration: 900, delay: 250 });
    }
    if (key === '08') {
      add('.studio-base', [{ opacity: .12 }, { opacity: 1 }], { duration: 1150, delay: 50 });
      add('.studio-glint', [{ opacity: 0, backgroundPosition: '150% 0', offset: 0 }, { opacity: 1, backgroundPosition: '130% 0', offset: .15 }, { opacity: 1, backgroundPosition: '-25% 0', offset: .8 }, { opacity: 0, backgroundPosition: '-40% 0', offset: 1 }], { duration: 1450, delay: 150, easing: 'ease-in-out' });
    }
    if (key === '09') {
      add('.beside-price', [{ opacity: 0, transform: 'translateX(12px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 70 });
      add('.sample-button', [{ opacity: .6, transform: 'translateX(-5px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 180 });
    }
    if (key === '10') {
      add('.balance-price .three', [{ opacity: 0, transform: 'translateY(12px) rotate(-8deg)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 80 });
      add('.balance-price .zero', [{ opacity: 0, transform: 'translateY(12px) rotate(8deg)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 210 });
      add('.balance-price .currency', [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 450 });
    }
    return set;
  }
  function cancelFocus() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    animations.forEach(animation => animation.cancel());
    animations = [];
  }
  function setTime(time) {
    current = Math.max(0, Math.min(duration, time));
    animations.forEach(animation => { animation.currentTime = current; });
    slider.value = String(current);
    slider.setAttribute('aria-valuetext', `${(current / 1000).toFixed(1)} seconds`);
  }
  function pauseState(value) {
    paused = value;
    $('.pause').setAttribute('aria-pressed', String(value));
    $('.pause').textContent = value ? 'Play' : 'Pause';
  }
  function tick(now) {
    if (paused || compareMode || document.hidden) { animationFrame = 0; return; }
    setTime(current + (now - clock) * (slow ? .5 : 1));
    clock = now;
    if (current < duration) animationFrame = requestAnimationFrame(tick);
    else { animationFrame = 0; pauseState(true); }
  }
  function playFocus() {
    cancelAnimationFrame(animationFrame);
    if (reduced.matches) { setTime(duration); pauseState(true); return; }
    pauseState(false);
    setTime(0);
    clock = performance.now();
    animationFrame = requestAnimationFrame(tick);
  }
  function playComparison(node) {
    comparisonAnimations.get(node)?.forEach(animation => animation.cancel());
    if (reduced.matches) return;
    const set = animationSet(node);
    comparisonAnimations.set(node, set);
    set.forEach(animation => { animation.playbackRate = slow ? .5 : 1; animation.play(); });
  }
  function select(design, autoplay = true) {
    cancelFocus();
    selected = design;
    $('.active-number').textContent = design.id;
    $('#direction-title').textContent = design.name;
    $('#direction-copy').textContent = design.copy;
    $('.focus-design').innerHTML = designMarkup(design);
    nav.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.option === design.id)));
    comparison.querySelectorAll('.compare-card').forEach(card => card.classList.toggle('is-selected', card.dataset.card === design.id));
    history.replaceState(null, '', `#${design.id}`);
    if (!reduced.matches) animations = animationSet($('.focus-design .design'));
    setTime(duration);
    pauseState(true);
    if (autoplay && !compareMode) playFocus();
  }
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    const node = entry.target.querySelector('.design');
    if (entry.isIntersecting && compareMode) playComparison(node);
    else comparisonAnimations.get(node)?.forEach(animation => animation.pause());
  }), { threshold: .65 });
  comparison.querySelectorAll('.compare-card').forEach(card => observer.observe(card));
  function setView(compare) {
    compareMode = compare;
    $('.focus-view').hidden = compare;
    comparison.hidden = !compare;
    $('.view-toggle').setAttribute('aria-pressed', String(compare));
    $('.view-toggle').innerHTML = compare ? 'Full preview <span aria-hidden="true">↗</span>' : 'Compare all <span aria-hidden="true">⊞</span>';
    if (compare) { cancelAnimationFrame(animationFrame); pauseState(true); }
    else { comparisonAnimations.forEach(set => set.forEach(animation => animation.cancel())); comparisonAnimations.clear(); playFocus(); }
  }
  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-option]');
    if (!button) return;
    if (compareMode) setView(false);
    select(designs.find(design => design.id === button.dataset.option));
  });
  comparison.addEventListener('click', event => {
    const inspect = event.target.closest('[data-inspect]');
    if (inspect) {
      setView(false);
      select(designs.find(design => design.id === inspect.dataset.inspect));
      $('.directions').scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'start' });
      nav.querySelector(`[data-option="${inspect.dataset.inspect}"]`).focus({ preventScroll: true });
      return;
    }
    const sample = event.target.closest('.sample-button');
    if (sample) playComparison(sample.closest('.design'));
  });
  $('.focus-design').addEventListener('click', event => { if (event.target.closest('.sample-button')) playFocus(); });
  $('.view-toggle').addEventListener('click', () => setView(!compareMode));
  $('.replay').addEventListener('click', playFocus);
  $('.pause').addEventListener('click', () => {
    if (!paused) { cancelAnimationFrame(animationFrame); pauseState(true); }
    else { if (current >= duration) setTime(0); pauseState(false); clock = performance.now(); animationFrame = requestAnimationFrame(tick); }
  });
  $('.speed').addEventListener('click', () => { slow = !slow; $('.speed').setAttribute('aria-pressed', String(slow)); playFocus(); });
  slider.addEventListener('input', () => { cancelAnimationFrame(animationFrame); pauseState(true); setTime(Number(slider.value)); });
  document.addEventListener('pointermove', event => {
    if (reduced.matches || event.pointerType !== 'mouse') return;
    const button = event.target.closest('.sample-button');
    if (!button) return;
    const bounds = button.getBoundingClientRect();
    button.style.setProperty('--mx', `${event.clientX - bounds.left}px`);
    button.style.setProperty('--my', `${event.clientY - bounds.top}px`);
  }, { passive: true });
  let pressTimer;
  document.addEventListener('pointerdown', event => {
    interacted = true;
    const design = event.target.closest('.sample-button')?.closest('.design');
    if (!design) return;
    clearTimeout(pressTimer);
    document.querySelectorAll('.is-pressing').forEach(node => node.classList.remove('is-pressing'));
    design.classList.add('is-pressing');
    pressTimer = setTimeout(() => design.classList.remove('is-pressing'), 900);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    cancelAnimationFrame(animationFrame); pauseState(true);
    comparisonAnimations.forEach(set => set.forEach(animation => animation.pause()));
  });
  reduced.addEventListener('change', () => {
    comparisonAnimations.forEach(set => set.forEach(animation => animation.cancel())); comparisonAnimations.clear();
    select(selected, false);
    $('.interaction-note').textContent = reduced.matches ? 'Reduced motion is on. Each design is shown in its finished state.' : 'Hover the button, or tap it on your phone. These previews do not add anything to your bag.';
  });
  select(selected, false);
  document.querySelectorAll('button:disabled,input:disabled').forEach(control => { control.disabled = false; });
  document.addEventListener('keydown', () => { interacted = true; }, { once: true });
  document.fonts.ready.then(() => {
    if (reduced.matches) $('.interaction-note').textContent = 'Reduced motion is on. Each design is shown in its finished state.';
    if (!interacted) playFocus();
  });
})();
