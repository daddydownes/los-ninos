(() => {
  'use strict';
  const hero = document.querySelector('.hero'), hat = document.querySelector('#hero-hat');
  const lettering = document.querySelector('.lettering-window');
  const drawing = document.querySelector('.sewing-drawing');
  const strokes = [...document.querySelectorAll('.sew-path')], satin = [...document.querySelectorAll('.sew-satin')];
  const finishedLetters = [...document.querySelectorAll('.sew-finish')];
  const thread = document.querySelector('.working-thread'), needle = document.querySelector('.sewing-head');
  const sheen = document.querySelector('.thread-sheen');
  const keyLight = document.querySelector('.hat-key-light');
  const glow = document.querySelector('.studio-glow');
  const viewer = document.querySelector('.viewer-frame');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Touch screens keep the stitching but do not repaint two full-size masks and
  // a brightness/contrast filter on every frame of the cap reveal.
  const touch = matchMedia('(hover: none), (pointer: coarse)');
  const painted = new WeakMap();
  function setStyle(element, property, value) {
    let values = painted.get(element);
    if(!values) { values = {}; painted.set(element, values); }
    value = String(value);
    if(values[property] === value) return;
    values[property] = value;
    element.style.setProperty(property, value);
  }
  // Measure the resting position so the opening stays centred at every size.
  function centreOpening() {
    let top = 0;
    for(let node = viewer; node; node = node.offsetParent) top += node.offsetTop;
    setStyle(viewer, '--opening-offset', Math.max(0, innerHeight / 2 - top - viewer.offsetHeight / 2) + 'px');
  }
  const layoutObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(centreOpening) : null;
  layoutObserver?.observe(hero);
  layoutObserver?.observe(viewer);
  const clamp = n => Math.max(0, Math.min(1, n));
  const smooth = n => { const p=clamp(n); return p*p*(3-2*p); };
  const duration = 4000, pace = 8500 / duration;
  const letterDurations = [560,600,540,650,330,680,630,650];
  const handoffs = [90,90,260,70,80,80,110,0];
  const stitchProgress = (run, ms) => {
    const p = clamp((ms-run.start)/run.duration);
    return .7*p + .3*smooth(p);
  };
  let nextStart = 140;
  const runs = strokes.map((path, i) => {
    path.style.strokeWidth = 4.2;
    const points = path.dataset.route.split(' ').map(pair => pair.split(',').map(Number));
    const distances = [0];
    for(let j=1;j<points.length;j++) distances.push(distances[j-1] + Math.hypot(points[j][0]-points[j-1][0],points[j][1]-points[j-1][1]));
    const run = {path,satin:satin[i],finish:finishedLetters[i],points,distances,length:distances.at(-1),start:nextStart,duration:letterDurations[i]};
    run.end = run.start + run.duration; nextStart = run.end + handoffs[i]; return run;
  });
  const sewingEnd = runs.at(-1).end;
  function sampleAt(run, fraction) {
    const target = clamp(fraction) * run.length;
    let lo=0, hi=run.distances.length-1;
    while(lo<hi) { const mid=Math.floor((lo+hi)/2); if(run.distances[mid]<target)lo=mid+1;else hi=mid; }
    const i=Math.max(1,lo), a=run.points[i-1], b=run.points[i];
    const span=run.distances[i]-run.distances[i-1], t=span ? (target-run.distances[i-1])/span : 0;
    return {point:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],pass:t};
  }
  const pointAt = (run, fraction) => sampleAt(run, fraction).point;
  function liveThread(ms) {
    let points=[], visible=0, slack=0, transporting=false;
    const active = runs.find(run => ms>=run.start && ms<=run.end);
    if(active) {
      const p=stitchProgress(active,ms), from=Math.max(0,p-80/active.length);
      // The live stitch is a single curve between its endpoints. Sampling its
      // entire route sixteen times did work that the curve never used.
      const sample = sampleAt(active,p);
      points = [pointAt(active,from), sample.point];
      visible=smooth((ms-140)/120);
      const tension=Math.sin(Math.PI*sample.pass);
      slack=22+20*tension;
    } else {
      const next = runs.find(run=>run.start>ms);
      if(next && next!==runs[0]) {
        const previous=runs[runs.indexOf(next)-1], a=previous.points.at(-1), b=next.points[0];
        const p=smooth((ms-previous.end)/(next.start-previous.end)), from=Math.max(0,p-24/Math.max(1,Math.hypot(b[0]-a[0],b[1]-a[1])));
        const control=[(a[0]+b[0])/2,Math.min(a[1],b[1])-Math.min(70,20+Math.hypot(b[0]-a[0],b[1]-a[1])*.12)];
        for(let i=0;i<=16;i++) { const t=from+(p-from)*i/16; points.push([(1-t)**2*a[0]+2*(1-t)*t*control[0]+t*t*b[0],(1-t)**2*a[1]+2*(1-t)*t*control[1]+t*t*b[1]]); }
        visible=1; transporting=true;
      } else if(ms>=sewingEnd) {
        const last=runs.at(-1), release=smooth((ms-sewingEnd)/260), tail=80*(1-release)/last.length;
        points = [pointAt(last,1-tail), pointAt(last,1)];
        visible=1-release; slack=22*(1-release);
      }
    }
    setStyle(thread,'opacity',visible*(transporting?.65:1));
    setStyle(needle,'opacity',visible*(transporting?.65:1));
    if(!points.length || visible===0) return;
    const tip=points.at(-1);
    if(slack>0) {
      const anchor=points[0];
      thread.setAttribute('d',`M${anchor[0]},${anchor[1]} C${anchor[0]-20},${anchor[1]-slack} ${tip[0]+20},${tip[1]-slack} ${tip[0]},${tip[1]}`);
    } else thread.setAttribute('d','M'+points.map(p=>p.map(n=>n.toFixed(2)).join(',')).join(' L'));
    needle.setAttribute('transform',`translate(${tip[0]},${tip[1]}) rotate(-32)`);
  }
  function draw(elapsed) {
    const ms = elapsed * pace;
    const settled = smooth((ms-sewingEnd)/220), handoff = 1-smooth((ms-7150)/600);
    setStyle(lettering,'opacity',settled * handoff);
    const drawingOpacity = 1-smooth((ms-sewingEnd-220)/200);
    setStyle(drawing,'opacity',drawingOpacity);
    if(drawingOpacity>0) {
      runs.forEach(run => {
        const p=stitchProgress(run,ms);
        // A fully offset round-capped dash still paints its endpoint in WebKit.
        // Hide unstarted strokes so future letters do not leave white dots.
        setStyle(run.path,'opacity',p>0 ? 1 : 0);
        setStyle(run.path,'stroke-dashoffset',1-p);
        setStyle(run.finish,'opacity',smooth((ms-run.end)/120));
        setStyle(run.satin,'stroke-dashoffset',1-p);
        setStyle(run.satin,'opacity',p>0 ? .16*(1-smooth((ms-run.end)/180)) : 0);
      });
      liveThread(ms);
    }
    setStyle(viewer,'--arrival',1-smooth((elapsed-3200)/800));
    const progress=clamp((ms-5800)/1950);
    // The reveal helper is decorative. A failed script request should still
    // leave a complete, usable storefront with a simple cap fade.
    if(window.LosNinosReveal?.paint) window.LosNinosReveal.paint(hat,'studio',progress);
    else setStyle(hat,'opacity',smooth(progress*1.45));
    if(!touch.matches) {
      const glint = clamp((ms-sewingEnd-80)/1600);
      setStyle(sheen,'opacity',glint>0 && glint<1 ? .2*Math.sin(Math.PI*glint)**2 : 0);
      if(glint>0 && glint<1) {
        const x=28+48*glint;
        const band=`linear-gradient(105deg, transparent ${x-9}%, #000 ${x}%, transparent ${x+9}%)`;
        setStyle(sheen,'mask-image',band); setStyle(sheen,'-webkit-mask-image',band);
      }
      const light=clamp((ms-5860)/1850);
      setStyle(keyLight,'opacity',light>0 && light<1 ? .22*Math.sin(Math.PI*light)**2 : 0);
      if(light>0 && light<1) {
        const pool=`radial-gradient(ellipse at ${18+50*smooth(light)}% ${28+16*light}%, #000 0%, #0009 18%, transparent 52%)`;
        setStyle(keyLight,'mask-image',pool); setStyle(keyLight,'-webkit-mask-image',pool);
      }
    } else {
      setStyle(sheen,'opacity',0); setStyle(keyLight,'opacity',0);
    }
    setStyle(glow,'opacity',smooth((ms-5850)/1850));
  }

  let frame=0, timeout, completed = false, startedAt = null;
  let reloadReady = !window.lnReloadOpening;
  function cancel() {
    clearTimeout(timeout); cancelAnimationFrame(frame); frame=0;
  }
  function setInterface(active) {
    document.querySelectorAll('.product-interface,.journey-header,.skip-link,.journey-worn,.journey-footer').forEach(element => { element.inert = !active; });
  }
  function finish(notify=true) {
    if(completed) return;
    completed = true; layoutObserver?.disconnect(); cancel(); clearTimeout(window.lnIntroGuard);
    // Reduced motion, backgrounding, and image failures use the same cheap,
    // final state without running the SVG/mask animation pipeline once more.
    setStyle(hat,'opacity',1); setStyle(hat,'filter','none');
    setStyle(hat,'mask-image','none'); setStyle(hat,'-webkit-mask-image','none');
    setStyle(viewer,'--arrival',0); setStyle(glow,'opacity',1);
    [drawing,lettering,sheen,keyLight,thread,needle].forEach(element=>setStyle(element,'opacity',0));
    document.removeEventListener('visibilitychange',onVisibilityChange);
    document.removeEventListener('ln:intro-complete',onIntroComplete);
    window.removeEventListener('pagehide',finish);
    window.removeEventListener('pageshow',onPageShow);
    reduced.removeEventListener('change',onMotionChange);
    hat.removeEventListener('error',finish);
    hero.dataset.introElapsed = String(startedAt===null ? 0 : Math.round(performance.now()-startedAt));
    hero.classList.add('intro-complete');
    document.documentElement.classList.remove('intro-pending');
    setInterface(true);
    if(notify) document.dispatchEvent(new CustomEvent('ln:intro-complete'));
  }
  function play() {
    if(completed) return;
    if(reduced.matches || document.hidden || !hat.complete || !hat.naturalWidth) { finish(); return; }
    cancel();
    document.documentElement.classList.add('intro-pending');
    hero.classList.remove('intro-complete'); setInterface(false); centreOpening(); draw(0);
    startedAt=performance.now();
    const tick = now => {
      frame=0;
      if(completed) return;
      const elapsed=now-startedAt;
      if(elapsed>=duration) { finish(); return; }
      draw(elapsed);
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    timeout=setTimeout(finish,duration+250);
  }
  // A suspended tab must never return to a frozen, interaction-blocking intro.
  window.LosNinosIntro={isComplete:()=>completed,duration};
  function onIntroComplete() { if(window.lnSkipIntro) finish(false); }
  function onPageShow(event) { if(event.persisted) finish(); }
  document.addEventListener('ln:intro-complete',onIntroComplete);
  function onMotionChange() { if(reduced.matches) finish(); }
  function onVisibilityChange() { if(document.hidden) finish(); }
  reduced.addEventListener('change',onMotionChange);
  document.addEventListener('visibilitychange',onVisibilityChange);
  window.addEventListener('pagehide',finish);
  window.addEventListener('pageshow',onPageShow);
  hat.addEventListener('error',finish,{once:true});
  let preparing=false;
  async function ready() {
    if(completed || !reloadReady || preparing) return;
    preparing=true;
    try {
      await Promise.all([
        ...document.querySelectorAll('.product-lockup img')
      ].map(image=>image.decode()));
      // Font loading is independent of this image/SVG entrance. Waiting for
      // every font could hold the entire interface inert on a slow connection.
      if(completed) return;
      if(window.lnSkipIntro) { finish(); return; }
      centreOpening(); draw(0);
      // Give the decoded textures and initial SVG state two paint opportunities.
      await new Promise(resolve=>{
        frame=requestAnimationFrame(()=>{
          frame=requestAnimationFrame(()=>{frame=0;resolve();});
        });
      });
      if(completed) return;
      clearTimeout(timeout);
      clearTimeout(window.lnIntroGuard);
      play();
    } catch (_) { finish(); }
  }
  function startWhenReady() {
    if(window.lnHistoryOpening || window.lnSkipIntro || location.hash || history.state?.lnBag || reduced.matches || document.hidden) finish();
    else {
      setInterface(false);
      timeout=setTimeout(finish,Math.max(0,10000-performance.now()));
      ready();
    }
  }
  if(window.lnReloadOpening) {
    setInterface(false);
    // Reload restoration can happen after deferred scripts. Begin on the first
    // painted page frame, once the browser has finished restoring the old scroll.
    window.addEventListener('pageshow',()=>requestAnimationFrame(()=>{
      if(completed) return;
      window.scrollTo({top:0,left:0,behavior:'instant'});
      reloadReady=true;
      startWhenReady();
    }),{once:true});
  } else {
    startWhenReady();
  }
})();
