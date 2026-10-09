(() => {
  'use strict';
  const fine=matchMedia('(hover: hover) and (pointer: fine)');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.purchase-button-shell').forEach(shell=>{
    const button=shell.querySelector('.add-button--magnetic');
    if(!button)return;
    let frame=0,point=null;
    function reset(){
      if(frame)cancelAnimationFrame(frame);frame=0;point=null;
      button.classList.remove('is-pointing');
      button.style.setProperty('--pull-x','0px');button.style.setProperty('--pull-y','0px');
    }
    function paint(){
      frame=0;if(!point)return;
      // Measure the unmoving shell so the button never chases its own translated box.
      const bounds=shell.getBoundingClientRect();
      const x=point.x-bounds.left,y=point.y-bounds.top;
      const dx=Math.max(-7,Math.min(7,(x-bounds.width/2)*.05));
      const dy=Math.max(-3,Math.min(3,(y-bounds.height/2)*.10));
      button.style.setProperty('--pull-x',`${reduced.matches?0:dx}px`);
      button.style.setProperty('--pull-y',`${reduced.matches?0:dy}px`);
      button.style.setProperty('--pointer-x',`${x}px`);button.style.setProperty('--pointer-y',`${y}px`);
    }
    shell.addEventListener('pointermove',event=>{
      if(!fine.matches||event.pointerType==='touch'||button.hasAttribute('data-bag-pending'))return;
      button.classList.add('is-pointing');point={x:event.clientX,y:event.clientY};
      if(!frame)frame=requestAnimationFrame(paint);
    });
    shell.addEventListener('pointerleave',reset);
    shell.addEventListener('pointercancel',reset);
    button.addEventListener('click',reset);
    button.addEventListener('blur',reset);
    fine.addEventListener('change',reset);reduced.addEventListener('change',reset);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
  });
})();
