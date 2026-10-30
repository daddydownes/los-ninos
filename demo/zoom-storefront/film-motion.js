(() => {
  'use strict';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const campaign=$('.campaign'),story=$('.story'),scene=$('.scene'),product=$('.flying-product'),slot=$('.hat-anchor');
  const card=$('.shop-card'),shell=$('.card-shell'),copies=$$('.card-copy'),plane=$('.film-plane');
  const header=$('.brandbar');
  const preview=$('#preview'); let bagOpen=false;
  const motion=matchMedia('(prefers-reduced-motion:reduce)'),mobile=matchMedia('(max-width:700px)');
  const portraitFilm=matchMedia('(max-width:700px) and (orientation:portrait)');
  const opening=window.LosNinosFilmOpenings?.selected||{id:'campaign',time:0,poster:'assets/film/model-portrait.jpg',mobilePoster:'assets/film/model-portrait-mobile.jpg'};
  const desktopPoster=opening.poster||`assets/film/opening-${opening.id}.jpg`;
  const mobilePoster=opening.mobilePoster||`assets/film/opening-${opening.id}-mobile.jpg`;
  preview.loop=false;
  function filmSource(){return portraitFilm.matches?(opening.mobileSrc||preview.dataset.mobileSrc):(opening.src||preview.dataset.src);}
  const poster=$('.film-poster');
  let revealCallback=0,revealRaf=0;
  function coverFilm(){
    if(revealCallback)preview.cancelVideoFrameCallback(revealCallback);
    cancelAnimationFrame(revealRaf);revealCallback=0;revealRaf=0;
    plane.classList.remove('film-started');delete preview.dataset.firstVisibleFrame;
  }
  function choosePoster(){
    preview.poster=portraitFilm.matches?mobilePoster:desktopPoster;
    poster.src=preview.poster;
  }
  function revealFilmWhenReady(){
    if(plane.classList.contains('film-started')||revealCallback||revealRaf)return;
    const show=time=>{
      if(!requested||preview.paused||preview.seeking||time<opening.time-.015)return false;
      preview.dataset.firstVisibleFrame=String(time);plane.classList.add('film-started');return true;
    };
    if(preview.requestVideoFrameCallback){
      const frame=(_now,metadata)=>{
        revealCallback=0;
        if(!show(metadata.mediaTime)&&requested)revealCallback=preview.requestVideoFrameCallback(frame);
      };
      revealCallback=preview.requestVideoFrameCallback(frame);
    }else{
      // Older browsers: the selected seek must finish before playback. Keep
      // the cover until two paint opportunities after the playing event.
      const paint=()=>{revealRaf=requestAnimationFrame(()=>{revealRaf=0;show(preview.currentTime)})};
      preview.addEventListener('playing',paint,{once:true});
    }
  }
  choosePoster();
  const clamp=v=>Math.min(1,Math.max(0,v)),ease=v=>{v=clamp(v);return v*v*(3-2*v)},lerp=(a,b,t)=>a+(b-a)*t;
  let ready=!document.documentElement.classList.contains('intro-pending'),progress=0,scheduled=false,visible=true,requested=false;
  let filmBuffered=false,filmLoading=false,filmUnavailable=false,filmTimer=0,filmTotalTimer=0,stallTimer=0;
  let filmRequest=null,filmObjectURL='',filmGeneration=0,playAttempt=0;
  let autoplayBlocked=false,filmRetryable=false,stallRecoveryUsed=false;
  function releaseFilm(){
    filmGeneration++;playAttempt++;
    clearTimeout(filmTimer);clearTimeout(filmTotalTimer);clearTimeout(stallTimer);
    filmRequest?.abort();filmRequest=null;
    if(filmObjectURL){URL.revokeObjectURL(filmObjectURL);filmObjectURL=''}
  }
  // Download the short selected loop explicitly. Browsers can stop preloading
  // a paused <video> before its end, so buffered ranges are not a download gate.
  // Once the Blob is local, playback and looping need no further network reads.
  function stillFilm(retryable=true){
    filmLoading=false;filmBuffered=false;filmUnavailable=true;requested=false;
    autoplayBlocked=false;filmRetryable=retryable;stallRecoveryUsed=false;
    releaseFilm();coverFilm();preview.pause();preview.removeAttribute('src');preview.load();
    preview.dataset.playback='still';
  }
  async function prepareFilm(){
    if(filmLoading||filmUnavailable)return;
    if(navigator.connection?.saveData){stillFilm(false);return;}
    const generation=++filmGeneration,controller=new AbortController();
    const current=()=>generation===filmGeneration&&!controller.signal.aborted;
    const expire=()=>{if(current())stillFilm()};
    const received=()=>{
      if(!current())return;
      clearTimeout(filmTimer);filmTimer=setTimeout(expire,30000);
    };
    filmRequest=controller;
    filmLoading=true;filmRetryable=false;preview.dataset.playback='loading';
    preview.dataset.source=filmSource();
    // A healthy slower download may take longer than the loop itself. Keep
    // showing the portrait while bytes arrive, with separate idle/total bounds.
    received();filmTotalTimer=setTimeout(expire,180000);
    try{
      const response=await fetch(filmSource(),{signal:controller.signal});
      if(!current())return;
      if(!response.ok)throw new Error('Film download failed');
      received();
      let bytes;
      if(response.body?.getReader){
        const reader=response.body.getReader(),chunks=[];
        try{
          while(current()){
            const {done,value}=await reader.read();
            if(!current()){await reader.cancel().catch(()=>{});return;}
            if(done)break;
            if(value?.byteLength){chunks.push(value);received();}
          }
          if(!current())return;
          bytes=new Blob(chunks,{type:response.headers.get('Content-Type')||'video/mp4'});
        }finally{reader.releaseLock();}
      }else bytes=await response.blob();
      if(!current())return;
      if(!bytes.size)throw new Error('Empty film');
      clearTimeout(filmTimer);clearTimeout(filmTotalTimer);
      filmRequest=null;filmLoading=false;filmBuffered=true;stallRecoveryUsed=false;
      preview.dataset.downloadBytes=String(bytes.size);
      preview.dataset.playback='ready';
      filmObjectURL=URL.createObjectURL(bytes);
      preview.preload='auto';preview.src=filmObjectURL;preview.load();
    }catch(error){
      if(current())stillFilm();
    }
  }
  for(const event of ['loadedmetadata','loadeddata','canplay'])preview.addEventListener(event,playback);
  preview.addEventListener('error',()=>{if(filmBuffered&&preview.error)stillFilm()});
  preview.addEventListener('playing',()=>{
    if(!filmBuffered||!requested)return;
    clearTimeout(stallTimer);stallRecoveryUsed=false;preview.dataset.playback='playing';
  });
  function recoverStall(){
    if(!filmBuffered||!requested)return;
    const generation=filmGeneration;
    clearTimeout(stallTimer);
    stallTimer=setTimeout(()=>{
      if(generation!==filmGeneration||!filmBuffered||!requested)return;
      if(stallRecoveryUsed){stillFilm();return;}
      // Local decoding can briefly stall after a resize or tab switch. Give
      // it time, then retry the existing Blob once before returning to a still.
      stallRecoveryUsed=true;requested=false;preview.pause();playback();
      recoverStall();
    },stallRecoveryUsed?8000:4000);
  }
  preview.addEventListener('waiting',recoverStall);
  preview.addEventListener('seeked',playback);
  preview.addEventListener('ended',()=>{
    requested=false;preview.currentTime=opening.time;
  });
  let selected=1;
  let layout={width:0,height:0,startSize:0};
  const hold=350, duration=1900;
  let settling=false, startedAt=0, fallback=0;
  function finishOpening(){unlockInput();settling=false;progress=1;clearTimeout(fallback);document.documentElement.classList.remove('opening-settling');scene.dataset.openingPhase='complete';card.classList.add('hat-docked');product.hidden=true;header.inert=false;clearTimeout(window.lnFilmGuard);schedule();}
  function beginOpening(){
    ready=true;
    if(motion.matches||document.hidden||window.lnSkipIntro){finishOpening();return;}
    settling=true;card.classList.remove('hat-docked');product.hidden=false;startedAt=performance.now();progress=0;
    document.documentElement.classList.add('opening-settling');
    scene.dataset.openingPhase='moving';header.inert=true;
    fallback=setTimeout(finishOpening,hold+duration+500);
    measure();
  }
  function measure(){layout.width=scene.clientWidth;layout.height=scene.clientHeight;layout.startSize=Math.min(mobile.matches?layout.width*.98:layout.width*.57,layout.height*(mobile.matches?.70:.80),720);product.style.width=layout.startSize+'px';product.style.height=layout.startSize+'px';schedule();}
  function playback(){
    const active=ready&&visible&&!document.hidden&&!bagOpen&&!motion.matches;
    if(!active){requested=false;playAttempt++;clearTimeout(stallTimer);preview.pause();return;}
    if(filmUnavailable||autoplayBlocked)return;
    // Prepare during the handover, but never play over the moving hat.
    if(!filmBuffered){if(progress>.025)prepareFilm();return;}
    // Decode the chosen opening during the hat handover, behind an exact
    // matching cover. Native video posters can disappear during a seek.
    if(preview.readyState<1||preview.seeking)return;
    if(preview.currentTime<opening.time-.015){preview.currentTime=opening.time;return;}
    if(settling||progress<1||scene.dataset.openingPhase!=='complete')return;
    if(requested)return;
    const generation=filmGeneration,attempt=++playAttempt;
    requested=true;revealFilmWhenReady();
    preview.play().catch(error=>{
      if(generation!==filmGeneration||attempt!==playAttempt||!requested)return;
      requested=false;clearTimeout(stallTimer);coverFilm();
      if(error?.name==='NotAllowedError'){
        // Keep the downloaded film. A natural tap/key can grant playback
        // permission without restarting the download or adding another button.
        autoplayBlocked=true;preview.dataset.playback='paused';
      }else stillFilm();
    });
  }
  function retryFilm(event){
    if(event?.type==='keydown'&&(event.repeat||!['Enter',' '].includes(event.key)))return;
    if(!ready||!visible||document.hidden||bagOpen||motion.matches||navigator.connection?.saveData)return;
    if(filmUnavailable&&filmRetryable){filmUnavailable=false;filmRetryable=false;}
    if(autoplayBlocked){
      // An online event is not a user gesture and cannot grant autoplay.
      if(event?.type==='online')return;
      autoplayBlocked=false;
    }
    playback();
  }
  addEventListener('pointerup',retryFilm,{passive:true});
  addEventListener('keydown',retryFilm);
  addEventListener('online',retryFilm);
  let paintedProgress = -1;
  function paint(now){scheduled=false;
    if(settling){progress=clamp((now-startedAt-hold)/duration);if(progress>=1)finishOpening();}
    const move=ease((progress-.08)/.66),reveal=ease((progress-.015)/.48),land=ease((progress-.45)/.30),details=ease((progress-.60)/.23);
    if(!product.hidden){
    const target=slot.getBoundingClientRect(),w=layout.width,h=layout.height,size=layout.startSize;
    const startX=w/2,startY=h*.46;
    const x=lerp(startX,target.left+target.width/2,move)-size/2;
    const y=lerp(startY,target.top+target.height/2,move)-size/2;
    const scale=lerp(1,target.width/size,move);
    product.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;
    const campaignBounds=campaign.getBoundingClientRect();product.style.visibility=campaignBounds.bottom<0?'hidden':'visible';
    }
    if (paintedProgress !== progress) {
    paintedProgress = progress;
    plane.style.opacity=reveal;plane.style.transform=`scale(${1.035-.035*reveal})`;
    shell.style.opacity=land;shell.style.transform=`translateY(${12*(1-land)}px)`;
    copies.forEach(el=>{el.style.opacity=details;el.style.transform=`translateY(${9*(1-details)}px)`});
    card.inert=details<.94;card.style.pointerEvents=details>.94?'auto':'none';
    if(details>.94)card.classList.add('is-ready');
    }
    document.documentElement.classList.toggle('past-film',story.getBoundingClientRect().bottom<80);
    playback();
    if(settling)schedule();
  }
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(paint)}}
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',measure,{passive:true});
  const observer=new ResizeObserver(measure);observer.observe(scene);observer.observe(card);
  motion.addEventListener('change',()=>{if(motion.matches&&ready)finishOpening();measure()});mobile.addEventListener('change',measure);
  portraitFilm.addEventListener('change',()=>{
    requested=false;preview.pause();
    filmBuffered=false;filmLoading=false;filmUnavailable=false;
    autoplayBlocked=false;filmRetryable=false;stallRecoveryUsed=false;
    releaseFilm();coverFilm();preview.removeAttribute('src');preview.load();choosePoster();playback();
  });
  document.addEventListener('ln:intro-complete',beginOpening,{once:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&settling)finishOpening();playback()});
  addEventListener('pagehide',()=>{if(settling)finishOpening()});
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;playback()},{threshold:0}).observe(scene);
  function updateCard(state=window.LosNinosBag?.getState()){
    if(!state)return;
    document.documentElement.classList.remove('bag-controller-unavailable');
    const {quantity:count,catalog,catalogPhase,pending}=state;
    const available=catalog?Math.max(0,Math.min(state.limit,state.available)):0;
    const ready=catalogPhase==='ready'&&catalog?.acceptingOrders;
    const inBag=count>0;
    selected=inBag?count:Math.min(Math.max(1,selected),Math.max(1,available));
    $('.card-quantity').textContent=selected;
    $('.card-quantity').setAttribute('aria-label',inBag?'Quantity in your bag':'Quantity to add');
    $('.card-stepper').setAttribute('aria-label',inBag?'Quantity in your bag':'Quantity to add');
    $('.card-less').setAttribute('aria-label',inBag?'Decrease bag quantity':'Decrease quantity to add');
    $('.card-more').setAttribute('aria-label',inBag?'Increase bag quantity':'Increase quantity to add');
    $('.card-less').disabled=!ready||selected<=1||pending;
    $('.card-more').disabled=!ready||selected>=available||pending;
    const unavailable=!available&&catalogPhase==='ready'&&!inBag;
    $('.card-stepper').hidden=unavailable;
    $('.quantity-label').hidden=unavailable;
    $('.quantity-label').textContent=inBag?'In your bag':'Quantity';
    $('.full-bag-note').hidden=!unavailable;
    $('.full-bag-note').textContent='Currently unavailable';
    const add=$('[data-add-to-bag]');
    add.dataset.addQuantity=selected;
    // The same button opens the bag once it contains hats; it never adds the
    // displayed bag total again. The shared controller owns the click.
    add.toggleAttribute('data-bag-open',inBag&&!pending);
    add.disabled=pending||catalogPhase==='loading'||(!inBag&&catalogPhase==='ready'&&(!ready||!available));
    const total=catalog?new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(catalog.product.priceCents*selected/100).replace(/\.00$/,''):'';
    $('.add-label').textContent=pending?'Added to bag':catalogPhase==='loading'?'Checking availability…':inBag?`View bag${total?` · ${total}`:''}`:catalogPhase==='error'?'Retry availability':!ready||!available?'Unavailable':`${selected===1?'Add to bag':`Add ${selected} hats`} · ${total}`;
    add.setAttribute('aria-label',$('.add-label').textContent);
    const badge=$('[data-bag-count]');badge.hidden=!count;
  }
  function changeQuantity(delta){
    const state=window.LosNinosBag?.getState();
    if(state?.quantity>0)window.LosNinosBag.setQuantity(state.quantity+delta);
    else{selected=Math.max(1,selected+delta);updateCard()}
  }
  $('.card-less').onclick=()=>changeQuantity(-1);
  $('.card-more').onclick=()=>changeQuantity(1);
  document.addEventListener('ln:bag-render',e=>updateCard(e.detail));
  // If the optional bag script failed, retain a native path to checkout.
  setTimeout(()=>{if(!window.LosNinosBag)document.documentElement.classList.add('bag-controller-unavailable')},12000);
  document.addEventListener('ln:bag-visibility',e=>{bagOpen=e.detail.open;playback()});
  window.LosNinosJourney={navigateToShop(){window.scrollTo({top:0,behavior:motion.matches?'instant':'smooth'})}};
  addEventListener('pageshow',e=>{if(e.persisted){finishOpening();measure();updateCard();}});
  const lockInput=e=>{if(document.documentElement.matches('.intro-pending,.opening-settling'))e.preventDefault()};
  addEventListener('wheel',lockInput,{passive:false});addEventListener('touchmove',lockInput,{passive:false});
  const lockKey=e=>{if(['ArrowDown','ArrowUp','PageDown','PageUp',' ','Home','End'].includes(e.key))lockInput(e)};
  addEventListener('keydown',lockKey);
  function unlockInput(){
    removeEventListener('wheel',lockInput);
    removeEventListener('touchmove',lockInput);
    removeEventListener('keydown',lockKey);
  }
  // The existing intro has its own ten-second preparation fallback.
  scene.dataset.openingPhase=ready?'complete':'stitch';
  if(ready)finishOpening();
  updateCard();measure();
})();
