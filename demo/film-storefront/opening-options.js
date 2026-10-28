(() => {
  'use strict';
  const options=window.LosNinosFilmOpenings.frames;
  const choices=document.querySelector('#choices'),play=document.querySelector('#play');
  const full=document.querySelector('#full'),status=document.querySelector('#status');
  const live=document.querySelector('#live'),frame=document.querySelector('#preview-frame');
  const picker=document.querySelector('#frame-picker'),image=document.querySelector('#selected-image');
  const previous=document.querySelector('#previous-frame'),next=document.querySelector('#next-frame');
  const opening=window.LosNinosFilmOpenings.selected;
  let selected=options[Math.round((opening.id==='story'?.5:opening.time)*30)]||options[15],replay=0,observer;
  function select(option){
    selected=option;observer?.disconnect();live.hidden=true;frame.src='about:blank';
    status.textContent=`${option.name} selected. Play it with the hat intro, or compare another frame. The main demo is unchanged.`;render();
  }
  for(const option of options){
    const button=document.createElement('button');
    button.type='button';button.className='choice';button.dataset.choice=option.id;
    button.setAttribute('aria-label',`${option.name}, ${option.time.toFixed(3)} seconds`);
    button.innerHTML=`<img src="${option.mobilePoster}" alt="" loading="lazy" width="720" height="1560"><span class="number">${String(option.frame).padStart(2,'0')}</span>`;
    button.addEventListener('click',()=>select(option));
    choices.append(button);
  }
  function render(){
    for(const button of choices.children)button.setAttribute('aria-pressed',String(button.dataset.choice===selected.id));
    picker.value=selected.frame;picker.setAttribute('aria-valuetext',`${selected.name}, ${selected.time.toFixed(3)} seconds`);
    image.src=selected.mobilePoster;image.alt=`Selected opening, ${selected.name.toLowerCase()}`;
    document.querySelector('#frame-readout').textContent=`${selected.name} · ${selected.time.toFixed(3)}s`;
    previous.disabled=selected.frame===0;next.disabled=selected.frame===38;
    play.innerHTML=`Play ${selected.name.toLowerCase()} with the intro <span aria-hidden="true">↗</span>`;
    full.href=`./?opening=${selected.id}`;
  }
  picker.addEventListener('input',()=>select(options[Number(picker.value)]));
  previous.addEventListener('click',()=>select(options[Math.max(0,selected.frame-1)]));
  next.addEventListener('click',()=>select(options[Math.min(38,selected.frame+1)]));
  document.querySelector('#previous-opening').addEventListener('click',()=>select(options[15]));
  document.querySelector('#newer-opening').addEventListener('click',()=>select(options[0]));
  frame.addEventListener('load',()=>{
    const doc=frame.contentDocument,video=doc?.querySelector('#preview'),scene=doc?.querySelector('.scene');
    if(!video||!scene)return;
    const now=()=>Math.round(frame.contentWindow.performance.now());
    const report={choice:selected.id,settledAt:null,bufferedAt:null,firstPlayingAt:null,firstFrameTime:null,early:false,plays:0,events:[],frames:[]};
    const publish=()=>{frame.dataset.timing=JSON.stringify(report)};
    const settled=()=>{if(scene.dataset.openingPhase==='complete'){report.settledAt??=now();publish()}};
    observer?.disconnect();observer=new MutationObserver(settled);
    observer.observe(scene,{attributes:true,attributeFilter:['data-opening-phase']});settled();
    const buffered=()=>{
      if(video.buffered.length&&video.buffered.end(video.buffered.length-1)>=video.duration-.05){report.bufferedAt??=now();publish()}
    };
    for(const event of ['progress','loadeddata','canplaythrough'])video.addEventListener(event,buffered);
    for(const type of ['loadedmetadata','loadeddata','seeking','seeked','playing','waiting','ended'])video.addEventListener(type,()=>{
      if(report.events.length<50)report.events.push({type,at:now(),time:video.currentTime,phase:scene.dataset.openingPhase});publish();
    });
    if(video.requestVideoFrameCallback){
      const presented=(_time,metadata)=>{
        report.frames.push({at:now(),time:metadata.mediaTime,phase:scene.dataset.openingPhase,covered:!!doc.querySelector('.film-poster')&&!scene.querySelector('.film-plane').classList.contains('film-started')});publish();
        if(report.frames.length<24)video.requestVideoFrameCallback(presented);
      };
      video.requestVideoFrameCallback(presented);
    }
    const state=()=>{
      frame.dataset.media=JSON.stringify({time:video.currentTime,duration:video.duration,paused:video.paused,ended:video.ended,playback:video.dataset.playback,firstVisibleFrame:video.dataset.firstVisibleFrame,hidden:doc.hidden});
    };
    for(const event of ['timeupdate','playing','pause','ended'])video.addEventListener(event,state);
    video.addEventListener('playing',()=>{
      report.firstPlayingAt??=now();report.firstFrameTime??=video.currentTime;report.plays++;
      report.early ||= scene.dataset.openingPhase!=='complete';publish();
      status.textContent=report.early?'Preview timing needs checking.':'The hat finishes first, then the film plays.';
    });
  });
  play.addEventListener('click',()=>{
    observer?.disconnect();delete frame.dataset.timing;live.hidden=false;
    document.querySelector('#live-title').textContent=`${selected.name} · ${selected.time.toFixed(3)}s`;
    status.textContent='Playing the hat intro…';
    frame.src=`./?opening=${selected.id}&replay=${++replay}`;
    live.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
  });
  render();
})();
