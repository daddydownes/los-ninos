(() => {
  const models=window.LosNinosFilmOpenings.models;
  const film=document.querySelector('#film'),site=document.querySelector('#site-preview');
  let selected=models[2],format='phone',mode='intro';
  const stage=document.querySelector('.stage');
  function fitPreview(){
    if(mode!=='intro'){stage.style.height='';return;}
    const phone=format==='phone',width=stage.clientWidth;
    const scale=phone?1:width/1024,height=phone?Math.round(width*844/390):720;
    site.style.width=phone?'100%':'1024px';site.style.height=height+'px';
    site.style.maxWidth='none';site.style.transformOrigin='top left';
    site.style.transform=phone?'none':`scale(${scale})`;
    stage.style.height=Math.round(height*scale)+'px';
  }
  new ResizeObserver(fitPreview).observe(stage);
  const notes={model:'This begins just after the initial blink in the rear-car shot and preserves every following frame through the boot closure. The cap goes on during the scene.',portrait:'The portrait shot is brief in the original film. It continues into the original next angle without jumping back to an earlier scene.',campaign:'The portrait is the still image during the hat intro. When the hat lands, a deliberate cut starts the longer film beside the car. The matching portrait and the extreme cap close-up are omitted; the remaining action stays in its original order.'};
  function load(){
    film.pause();site.src='about:blank';
    document.querySelector('.stage').classList.toggle('phone',format==='phone');
    document.querySelectorAll('[data-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.choice===selected.id)));
    document.querySelectorAll('[data-format]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.format===format)));
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    document.querySelector('#selected-title').textContent=selected.name;
    document.querySelector('#open-full').href=`./?opening=${selected.id}`;
    document.querySelector('#note').textContent=notes[selected.id];
    document.querySelector('#play').textContent=`Play ${selected.name.toLowerCase()}`;
    document.querySelector('.play-row').hidden=mode==='intro';
    film.hidden=mode==='intro';site.hidden=mode!=='intro';
    fitPreview();
    if(mode==='intro'){film.removeAttribute('src');film.load();site.src=`./?opening=${selected.id}`;return;}
    film.poster=format==='phone'?selected.mobilePoster:selected.poster;
    film.src=format==='phone'?selected.mobileSrc:selected.src;
    film.dataset.events='[]';film.load();updateTime();
  }
  function updateTime(){document.querySelector('#time').textContent=`${Math.max(0,film.currentTime-selected.time).toFixed(2)} / ${(selected.duration??(518/30-selected.time)).toFixed(2)}`}
  film.addEventListener('loadedmetadata',()=>{film.currentTime=selected.time;updateTime()});
  film.addEventListener('timeupdate',updateTime);
  document.querySelector('#play').onclick=()=>{film.currentTime=selected.time;film.play().catch(()=>{})};
  document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{selected=models.find(x=>x.id===b.dataset.choice);if(selected.id==='campaign')mode='intro';load();document.querySelector('#review-stage').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'})});
  document.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>{format=b.dataset.format;load()});
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;load()});
  for(const type of ['playing','waiting','ended','error'])film.addEventListener(type,()=>{const e=JSON.parse(film.dataset.events||'[]');e.push({type,time:film.currentTime});film.dataset.events=JSON.stringify(e.slice(-30))});
  site.addEventListener('load',()=>{
    const doc=site.contentDocument,v=doc?.querySelector('#preview');if(!v)return;
    const report={opening:selected.id,format,events:[]};site.dataset.report=JSON.stringify(report);
    for(const type of ['playing','waiting','ended','error'])v.addEventListener(type,()=>{
      report.events.push({type,time:v.currentTime,phase:doc.querySelector('.scene').dataset.openingPhase,source:v.dataset.source,viewport:[doc.documentElement.clientWidth,doc.documentElement.clientHeight],video:[v.videoWidth,v.videoHeight],poster:doc.querySelector('.film-poster').getAttribute('src')});
      site.dataset.report=JSON.stringify(report);
    });
  });
  load();
  document.querySelector('main').dataset.modelReady='true';
})();
