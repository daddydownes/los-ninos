/* The same feathered reveals power the opening and the comparison study. */
window.LosNinosReveal = (() => {
  const clamp = n => Math.max(0, Math.min(1, n));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const touch = matchMedia('(hover: none), (pointer: coarse)');
  const painted = new WeakMap();
  const active = new Set();
  reduced.addEventListener('change', () => {
    if (reduced.matches) active.forEach(animation => animation.finish());
  });
  const smooth = n => { const p = clamp(n); return p * p * (3 - 2 * p); };
  const variants = [
    {id:'studio', name:'Studio light', description:'The lettering holds. The cap emerges as the studio light slowly comes up.'},
    {id:'bloom', name:'Soft bloom', description:'A feathered reveal spreads out from the embroidery, following the cap’s silhouette.'},
    {id:'focus', name:'Focus pull', description:'The cap appears out of soft focus. The white lettering stays sharp until the fabric resolves.'},
    {id:'crown', name:'Brim to crown', description:'Light rises from the brim through the crown. A wide, soft falloff keeps the reveal smooth.'},
    {id:'side', name:'Side light', description:'A soft light moves across the cap from left to right, bringing the fabric into view.'}
  ];
  function paint(hat, kind, progress) {
    const p = reduced.matches ? 1 : clamp(progress), t = smooth(p);
    const simple = touch.matches;
    const previous = painted.get(hat);
    if (previous?.kind === kind && previous.progress === p && previous.simple === simple) return;
    painted.set(hat, {kind, progress: p, simple});
    hat.style.clipPath = 'none';
    let mask = 'none', opacity = t, filter = 'none';
    // Animated filters and gradient masks repeatedly rasterize the large hat
    // texture on iOS. An opacity reveal keeps the same timing on touch devices.
    if (simple) {
      opacity = smooth(p * (kind === 'studio' ? 1.45 : 1));
    } else if (kind === 'studio') {
      opacity = smooth(p * 1.45);
      filter = `brightness(${.025 + .975 * t}) contrast(${1.22 - .22 * t})`;
    } else if (kind === 'bloom') {
      const r = -26 + t * 121;
      opacity = smooth(p * 4);
      mask = `radial-gradient(circle at 50.32% 51.83%, #000 ${r}%, transparent ${r + 26}%)`;
      filter = `brightness(${.65 + .35 * t})`;
    } else if (kind === 'focus') {
      opacity = smooth(p * 1.6);
      filter = `blur(${9 * (1 - t)}px) brightness(${.38 + .62 * t})`;
    } else if (kind === 'crown') {
      const edge = 147 - t * 147;
      opacity = smooth(p * 4);
      mask = `linear-gradient(to bottom, transparent ${edge - 47}%, #000 ${edge}%)`;
      filter = `brightness(${.7 + .3 * t})`;
    } else if (kind === 'side') {
      const edge = -49 + t * 149;
      opacity = smooth(p * 4);
      mask = `linear-gradient(110deg, #000 ${edge}%, transparent ${edge + 49}%)`;
      filter = `brightness(${.7 + .3 * t})`;
    }
    if (p >= 1) { mask = 'none'; filter = 'none'; opacity = 1; }
    hat.style.opacity = opacity;
    hat.style.filter = filter;
    hat.style.maskImage = mask;
    hat.style.webkitMaskImage = mask;
  }
  function animate(hat, kind, duration, delay = 0) {
    duration = reduced.matches ? 0 : Math.max(0, duration);
    delay = reduced.matches ? 0 : Math.max(0, delay);
    paint(hat, kind, duration ? 0 : 1);
    const animation = hat.animate([{}, {}], {duration, delay, fill:'both'});
    active.add(animation);
    let frame;
    const cleanup = () => { cancelAnimationFrame(frame); active.delete(animation); };
    const tick = () => {
      paint(hat, kind, duration ? ((animation.currentTime || 0) - delay) / duration : 1);
      if (animation.playState !== 'finished' && animation.playState !== 'idle') frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    animation.finished.then(() => { cleanup(); paint(hat, kind, 1); }).catch(cleanup);
    return animation;
  }
  return {variants, paint, animate, smooth};
})();
