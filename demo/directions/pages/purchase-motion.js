(() => {
  'use strict';
  const fine=matchMedia('(hover: hover) and (pointer: fine)');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.purchase-button-shell').forEach(shell=>{
    const button=shell.querySelector('.add-button--magnetic');
    if(!button)return;
    let frame=0,point=null,tracking=false;
    function reset(){
      if(frame)cancelAnimationFrame(frame);frame=0;point=null;
      button.classList.remove('is-pointing');
      button.style.setProperty('--pull-x','0px');button.style.setProperty('--pull-y','0px');
    }
    function paint(){
      frame=0;
      if(!tracking||!point||button.hasAttribute('data-bag-pending')) { reset(); return; }
      // Measure the unmoving shell so the button never chases its own translated box.
      const bounds=shell.getBoundingClientRect();
      const x=point.x-bounds.left,y=point.y-bounds.top;
      const dx=Math.max(-7,Math.min(7,(x-bounds.width/2)*.05));
      const dy=Math.max(-3,Math.min(3,(y-bounds.height/2)*.10));
      button.style.setProperty('--pull-x',`${dx}px`);
      button.style.setProperty('--pull-y',`${dy}px`);
      button.style.setProperty('--pointer-x',`${x}px`);button.style.setProperty('--pointer-y',`${y}px`);
    }
    function onPointerMove(event) {
      if(event.pointerType==='touch'||button.hasAttribute('data-bag-pending'))return;
      button.classList.add('is-pointing');point={x:event.clientX,y:event.clientY};
      if(!frame)frame=requestAnimationFrame(paint);
    }
    function updateTracking() {
      const enabled=fine.matches&&!reduced.matches&&!document.hidden;
      if(enabled===tracking)return;
      tracking=enabled;
      if(tracking) shell.addEventListener('pointermove',onPointerMove,{passive:true});
      else { shell.removeEventListener('pointermove',onPointerMove); reset(); }
    }
    shell.addEventListener('pointerleave',reset);
    shell.addEventListener('pointercancel',reset);
    button.addEventListener('click',reset);
    button.addEventListener('blur',reset);
    fine.addEventListener('change',updateTracking);
    reduced.addEventListener('change',updateTracking);
    document.addEventListener('visibilitychange',updateTracking);
    window.addEventListener('pagehide',reset);
    window.addEventListener('pageshow',updateTracking);
    window.addEventListener('blur',reset);
    updateTracking();
  });
})();
