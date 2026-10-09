(() => {
  'use strict';
  const header=document.querySelector('.journey-header');
  const worn=document.querySelector('#worn');
  const frame=document.querySelector('.viewer-frame');
  const image=document.querySelector('#hero-hat');
  const status=document.querySelector('[data-view-status]');
  const error=document.querySelector('.view-error');
  const retry=document.querySelector('[data-view-retry]');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let headerFrame=0, retryCount=0, requestId=0, lastHeaderSurface;
  function renderImage() {
    const loaded=image.complete&&image.naturalWidth>0;
    frame.classList.toggle('has-good-image',loaded);
  }
  function showFailure() { error.hidden=false; renderImage(); }
  image.addEventListener('load',()=>{error.hidden=true;renderImage();});
  image.addEventListener('error',showFailure);
  if(image.complete&&!image.naturalWidth) showFailure(); else renderImage();
  retry.addEventListener('click',async()=>{
    const token=++requestId;
    const restoreFocus=document.activeElement===retry;
    let recovered=false;
    retry.disabled=true;
    frame.setAttribute('aria-busy','true');
    status.textContent='Loading the hat image.';
    const candidate=new Image();
    const url=new URL('../../../assets/hat-front-logo-v1.webp',document.baseURI);
    url.searchParams.set('retry',String(++retryCount));
    candidate.src=url.href;
    try {
      await candidate.decode();
      if(token!==requestId) return;
      image.src=candidate.src;
      await image.decode();
      if(token!==requestId) return;
      recovered=true;renderImage();
      error.hidden=true;
      if(restoreFocus&&(document.activeElement===document.body||document.activeElement===retry)) {
        image.tabIndex=-1;image.focus({preventScroll:true});
      }
      status.textContent='Hat image loaded.';
    } catch (_) {
      if(token!==requestId) return;
      showFailure();status.textContent='The hat image could not load. Retry is available.';
    } finally {
      if(token===requestId) {
        retry.disabled=false;frame.setAttribute('aria-busy','false');
        if(!recovered&&restoreFocus&&document.activeElement===document.body) retry.focus({preventScroll:true});
      }
    }
  });

  function setHeaderSurface() {
    headerFrame=0;
    const onPaper=worn.getBoundingClientRect().top<=header.getBoundingClientRect().bottom+1;
    if(onPaper===lastHeaderSurface) return;
    lastHeaderSurface=onPaper;
    header.classList.toggle('is-on-paper',onPaper);
  }
  window.addEventListener('scroll',()=>{if(!headerFrame)headerFrame=requestAnimationFrame(setHeaderSurface);},{passive:true});
  window.addEventListener('resize',setHeaderSurface);
  setHeaderSurface();

  // A single entrance per photograph; never tie the hat or images to scroll progress.
  const revealTargets=[...document.querySelectorAll('[data-reveal]')];
  let revealObserver;
  function finishReveals() {
    revealObserver?.disconnect();
    revealTargets.forEach(element=>element.classList.remove('reveal-pending'));
  }
  if(!reduced.matches && 'IntersectionObserver' in window) {
    try {
      revealObserver=new IntersectionObserver(entries=>{
        entries.forEach(entry=>{
          if(!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        });
      },{threshold:.06,rootMargin:'0px 0px -24px 0px'});
      revealTargets.forEach(element=>{
        if(element.getBoundingClientRect().top>=innerHeight) element.classList.add('reveal-pending');
        revealObserver.observe(element);
      });
    } catch (_) { finishReveals(); }
  }
  reduced.addEventListener('change',()=>{if(reduced.matches)finishReveals();});
  document.addEventListener('focusin',event=>event.target.closest?.('[data-reveal]')?.classList.add('is-visible'));

  function goTo(id,{push=true,focus=true,instant=false}={}) {
    const target=document.getElementById(id);
    if(!target) return;
    const move=()=>{
      if(push && location.hash!==`#${id}`) {
        const state={...(history.state||{}),lnSection:id};
        delete state.lnBag;
        history.pushState(state,'',`#${id}`);
      }
      const behavior=instant||reduced.matches?'instant':'smooth';
      if(id==='shop') {
        const action=document.querySelector('[data-add-to-bag]');
        const absoluteBottom=action.getBoundingClientRect().bottom+window.scrollY;
        const destination=absoluteBottom<=window.innerHeight-16 ? 0 : Math.max(0,target.getBoundingClientRect().top+window.scrollY-header.offsetHeight-24);
        window.scrollTo({top:destination,behavior});
      } else target.scrollIntoView({block:'start',behavior});
      const heading=target.querySelector('h1,h2');
      if(focus && heading) heading.focus({preventScroll:true});
      setHeaderSurface();
    };
    if(window.LosNinosBag) window.LosNinosBag.close({navigate:move}); else move();
  }
  window.LosNinosJourney={navigateToShop:()=>goTo('shop'),navigate:goTo};
  document.querySelectorAll('[data-journey-link]').forEach(link=>link.addEventListener('click',event=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey) return;
    const id=link.hash.slice(1);
    if(!document.getElementById(id)) return;
    event.preventDefault(); goTo(id);
  }));
  window.addEventListener('popstate',event=>{
    if(event.lnBagHandled || document.documentElement.hasAttribute('data-journey-bag-open') || event.state?.lnBag) return;
    setHeaderSurface();
  });
  window.addEventListener('hashchange',()=>{setHeaderSurface();});
  if(location.hash && !history.state?.lnBag) {
    const id=location.hash.slice(1);
    if(document.getElementById(id)) requestAnimationFrame(()=>goTo(id,{push:false,focus:false,instant:true}));
  }
  document.querySelectorAll('.photo-slot').forEach(slot=>{
    const photo=slot.querySelector('img'), recovery=slot.querySelector('.photo-error');
    const showFailure=()=>{recovery.hidden=false;};
    photo.addEventListener('error',showFailure);
    photo.addEventListener('load',()=>{
      const restoreFocus=recovery.contains(document.activeElement);
      recovery.hidden=true;
      if(restoreFocus) { photo.tabIndex=-1; photo.focus({preventScroll:true}); }
    });
    if(photo.complete&&!photo.naturalWidth) showFailure();
    slot.querySelector('[data-photo-retry]').addEventListener('click',()=>{
      const src=new URL(photo.getAttribute('src'),document.baseURI);
      src.searchParams.set('retry',String(Date.now()));
      photo.removeAttribute('srcset'); photo.src=src.href;
    });
  });
})();
