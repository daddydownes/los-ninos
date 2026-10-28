(() => {
  'use strict';
  const story=document.querySelector('.journey-worn');
  if(!story)return;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  if('IntersectionObserver' in window&&!reduced.matches){
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}
    },{threshold:.05});
    story.querySelectorAll('[data-reveal]').forEach(element=>{element.classList.add('reveal-pending');observer.observe(element)});
  }
  story.querySelectorAll('.photo-slot').forEach(slot=>{
    const image=slot.querySelector('img'),error=slot.querySelector('.photo-error');
    const retry=slot.querySelector('[data-photo-retry]');
    const originalSource=image.getAttribute('src');
    let retrying=false,attempt=0;
    const check=()=>{if(!retrying)error.hidden=!!(image.complete&&image.naturalWidth)};
    image.addEventListener('error',check);image.addEventListener('load',check);
    if(image.complete)check();
    retry.addEventListener('click',async()=>{
      if(retrying)return;
      retrying=true;retry.disabled=true;slot.setAttribute('aria-busy','true');
      const restoreFocus=document.activeElement===retry;
      const candidate=new Image(),url=new URL(originalSource,document.baseURI);
      url.searchParams.set('retry',String(Date.now())+'-'+String(++attempt));
      let timeout,recovered=false;
      const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Photo loading timed out')),15000)});
      try{
        candidate.src=url.href;
        await Promise.race([candidate.decode(),deadline]);
        // An existing srcset would otherwise keep selecting the failed URL.
        image.removeAttribute('srcset');image.src=url.href;
        await Promise.race([image.decode(),deadline]);
        recovered=true;error.hidden=true;
        if(restoreFocus&&(document.activeElement===retry||document.activeElement===document.body)){
          image.tabIndex=-1;image.focus({preventScroll:true});
        }
      }catch(_){
        error.hidden=false;
      }finally{
        clearTimeout(timeout);candidate.removeAttribute('src');
        if(!recovered&&image.src===url.href)image.removeAttribute('src');
        retrying=false;retry.disabled=false;slot.removeAttribute('aria-busy');
        if(!recovered&&restoreFocus&&document.activeElement===document.body)retry.focus({preventScroll:true});
      }
    });
  });
})();
