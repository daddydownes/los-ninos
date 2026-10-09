(() => {
  const hero = document.querySelector('.hero'), hat = document.querySelector('#hero-hat');
  const lettering = document.querySelector('.lettering-window');
  const drawing = document.querySelector('.sewing-drawing'), lockup = document.querySelector('.product-lockup');
  const strokes = [...document.querySelectorAll('.sew-path')], satin = [...document.querySelectorAll('.sew-satin')];
  const finishedLetters = [...document.querySelectorAll('.sew-finish')];
  const thread = document.querySelector('.working-thread'), needle = document.querySelector('.sewing-head');
  const sheen = document.querySelector('.thread-sheen');
  const keyLight = document.querySelector('.hat-key-light');
  const glow = document.querySelector('.studio-glow');
  const viewer = document.querySelector('.viewer-frame');
  // Measure the resting position so the opening stays centred at every size.
  function centreOpening() {
    let top = 0;
    for(let node = viewer; node; node = node.offsetParent) top += node.offsetTop;
    viewer.style.setProperty('--opening-offset', Math.max(0, innerHeight / 2 - top - viewer.offsetHeight / 2) + 'px');
  }
  const layoutObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(centreOpening) : null;
  layoutObserver?.observe(hero);
  layoutObserver?.observe(viewer);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const smooth = LosNinosReveal.smooth, clamp = n => Math.max(0, Math.min(1, n));
  const duration = 4000, pace = 8500 / duration;
  const letterDurations = [560,600,540,650,330,680,630,650];
  const handoffs = [90,90,260,70,80,80,110,0];
  const stitchProgress = (run, ms) => {
    const p = clamp((ms-run.start)/run.duration);
    return .7*p + .3*smooth(p);
  };
  let nextStart = 140;
  const runs = strokes.map((path, i) => {
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
      for(let i=0;i<=16;i++) points.push(pointAt(active,from+(p-from)*i/16));
      visible=smooth((ms-140)/120);
      const tension=Math.sin(Math.PI*sampleAt(active,p).pass);
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
        for(let i=0;i<=16;i++) points.push(pointAt(last,1-tail+tail*i/16));
        visible=1-release; slack=22*(1-release);
      }
    }
    thread.style.opacity=visible*(transporting?.65:1); needle.style.opacity=visible*(transporting?.65:1);
    if(!points.length) return;
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
    lettering.style.opacity = settled * handoff;
    drawing.style.opacity = 1-smooth((ms-sewingEnd-220)/200);
    runs.forEach(run => {
      const p=stitchProgress(run,ms);
      run.path.style.strokeDashoffset=1-p;
      const rest=smooth((ms-run.end)/180);
      run.path.style.strokeWidth=4.2;
      run.finish.style.opacity=smooth((ms-run.end)/120);
      run.satin.style.strokeDashoffset=1-p;
      run.satin.style.opacity=.16*(1-rest);
    });
    liveThread(ms);
    lockup.style.transform = 'translate(-50.32%,-51.83%)';
    viewer.style.setProperty('--arrival', String(1-smooth((elapsed-3200)/800)));
    const glint = clamp((ms-sewingEnd-80)/1600), x = 28+48*glint;
    const band = `linear-gradient(105deg, transparent ${x - 9}%, #000 ${x}%, transparent ${x + 9}%)`;
    sheen.style.maskImage = band; sheen.style.webkitMaskImage = band;
    sheen.style.opacity = .2 * Math.sin(Math.PI * glint)**2;
    LosNinosReveal.paint(hat, 'studio', (ms-5800)/1950);
    const light=clamp((ms-5860)/1850);
    const pool=`radial-gradient(ellipse at ${18+50*smooth(light)}% ${28+16*light}%, #000 0%, #0009 18%, transparent 52%)`;
    keyLight.style.maskImage=pool; keyLight.style.webkitMaskImage=pool;
    keyLight.style.opacity=light>0 && light<1 ? .22*Math.sin(Math.PI*light)**2 : 0;
    glow.style.opacity = smooth((ms-5850)/1850);
  }

  let clock, frame, timeout, generation = 0, completed = false, startedAt = null;
  let reloadReady = !window.lnReloadOpening;
  function cancel() {
    clearTimeout(timeout); cancelAnimationFrame(frame);
    if(clock) clock.cancel(); clock = null;
  }
  function setInterface(active) {
    document.querySelectorAll('.product-interface,.journey-header,.skip-link,.journey-worn,.journey-footer').forEach(element => { element.inert = !active; });
  }
  function finish() {
    if(completed) return;
    completed = true; layoutObserver?.disconnect(); generation++; cancel(); clearTimeout(window.lnIntroGuard); draw(duration);
    hero.dataset.introElapsed = String(startedAt===null ? 0 : Math.round(performance.now()-startedAt));
    hero.classList.add('intro-complete');
    document.documentElement.classList.remove('intro-pending');
    setInterface(true);
    document.dispatchEvent(new CustomEvent('ln:intro-complete'));
  }
  function play() {
    if(completed) return;
    if(reduced.matches || !hat.complete || !hat.naturalWidth || !hero.animate) { finish(); return; }
    cancel(); const current = ++generation;
    document.documentElement.classList.add('intro-pending');
    hero.classList.remove('intro-complete'); setInterface(false); centreOpening(); draw(0);
    startedAt=performance.now();
    clock = hero.animate([{},{}],{duration,fill:'both'});
    const tick = () => {
      if(current !== generation || !clock) return;
      draw(clock.currentTime || 0);
      if(clock.playState !== 'finished' && clock.playState !== 'idle') frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    clock.finished.then(() => { if(current === generation) finish(); }).catch(() => {});
    timeout=setTimeout(finish,duration+250);
  }
  // Only the animation clock or a genuine loading failure may end the entrance.
  window.LosNinosIntro={isComplete:()=>completed,duration};
  document.addEventListener('ln:intro-complete',()=>{if(window.lnSkipIntro)finish();});
  reduced.addEventListener('change',()=>{if(reduced.matches)finish();});
  window.addEventListener('pageshow',event=>{if(event.persisted)finish();});
  hat.addEventListener('error',finish,{once:true});
  let preparing=false;
  async function ready() {
    if(completed || !reloadReady || preparing) return;
    preparing=true;
    try {
      await Promise.all([
        ...document.querySelectorAll('.product-lockup img')
      ].map(image=>image.decode()));
      await document.fonts.ready;
      if(completed) return;
      if(window.lnSkipIntro) { finish(); return; }
      centreOpening(); draw(0);
      // Give the decoded textures and initial SVG state two paint opportunities.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(completed) return;
      clearTimeout(timeout);
      clearTimeout(window.lnIntroGuard);
      play();
    } catch (_) { finish(); }
  }
  function startWhenReady() {
    if(window.lnHistoryOpening || window.lnSkipIntro || location.hash || history.state?.lnBag || reduced.matches) finish();
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
