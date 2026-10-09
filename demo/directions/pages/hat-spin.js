(() => {
  'use strict';
  const section=document.querySelector('[data-orbit]');
  if(!section)return;
  const stage=section.querySelector('[data-orbit-stage]');
  const host=section.querySelector('[data-orbit-canvas]');
  const toolbar=section.querySelector('.orbit-toolbar');

  const status=section.querySelector('[data-orbit-status]');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const sequenceURL=new URL(section.dataset.sequence,document.baseURI);
  let requested=false;
  async function load() {
    if(requested)return;
    requested=true;
    let loading;
    try {
      stage.setAttribute('aria-busy','true');
      status.textContent='Loading the 360° preview…';
      loading=document.createElement('div');
      loading.className='spin-loading';
      loading.setAttribute('role','progressbar');
      loading.setAttribute('aria-label','Loading the 360-degree preview');
      loading.setAttribute('aria-valuemin','0');loading.setAttribute('aria-valuemax','100');loading.setAttribute('aria-valuenow','0');
      loading.innerHTML='<span class="spin-loading-label">Loading the 360° preview…</span><span class="spin-loading-number">0%</span><span class="spin-loading-track"><span></span></span>';
      stage.append(loading);
      const response=await fetch(sequenceURL);
      if(!response.ok)throw new Error('Sequence unavailable');
      const manifest=await response.json();
      // Keep the still usable if no valid sequence has been installed.
      if(!Array.isArray(manifest.frames)||manifest.frames.length<2){status.textContent='';return;}
      const images=[];
      for(const entry of manifest.frames) {
        const image=new Image();image.decoding='async';
        image.src=new URL(typeof entry==='string'?entry:entry.src,sequenceURL).href;
        await image.decode();images.push(image);
        const percent=Math.round(images.length/manifest.frames.length*100);
        loading.setAttribute('aria-valuenow',String(percent));
        loading.querySelector('.spin-loading-number').textContent=percent+'%';
        loading.querySelector('.spin-loading-track>span').style.transform='scaleX('+percent/100+')';
      }
      const canvas=document.createElement('canvas');
      const ctx=canvas.getContext('2d',{alpha:true});
      if(!ctx)throw new Error('Canvas unavailable');
      canvas.tabIndex=0;canvas.setAttribute('role','img');
      canvas.setAttribute('aria-label','Interactive AI-rendered 360-degree hat');
      canvas.setAttribute('aria-describedby','orbit-instructions');
      host.append(canvas);
      let position=0,velocity=0,drag=null,frame=0,last=0,visible=true,current=-1;
      const count=images.length;
      const wrap=value=>((Math.round(value)%count)+count)%count;
      function draw(force=false){
        const index=wrap(position);if(index===current&&!force)return;
        current=index;const image=images[index];
        const entry=manifest.frames[index];
        const alignment=typeof entry==='object'?entry:null;
        const unit=Math.min(canvas.width,canvas.height);
        const bounds=alignment?.bounds;
        const registered=manifest.registration==='fixed-crown-axis-v2';
        // A single fit for the entire sequence. Never zoom or slide individual views.
        const crownPixels=registered?Math.min(canvas.width*.46/manifest.radius,canvas.height*.62/manifest.bottom):0;
        const scale=registered?crownPixels/alignment.crownHeight:Math.min(unit/(alignment?.size||image.naturalWidth),bounds?canvas.width*.94/(bounds[2]-bounds[0]):Infinity);
        const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
        let x=alignment?canvas.width/2-alignment.x*scale:(canvas.width-w)/2;
        // Retain the rotation anchor where possible, but never crop the visor on phones.
        if(bounds&&!registered)x=Math.max(canvas.width*.03-bounds[0]*scale,Math.min(x,canvas.width*.97-bounds[2]*scale));
        const top=registered?(canvas.height-manifest.bottom*crownPixels)/2:canvas.height*.24;
        const y=alignment?top-alignment.y*scale:(canvas.height-h)/2;
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(image,x,y,w,h);
        canvas.dataset.frame=String(index);
      }
      function wake(){if(!frame&&visible&&!document.hidden)frame=requestAnimationFrame(tick);}
      function tick(now){
        frame=0;if(!visible||document.hidden)return;
        const dt=Math.min((now-(last||now))/1000,.04);last=now;
        if(!drag){position+=velocity*dt;velocity*=Math.exp(-dt*7);}
        draw();if(Math.abs(velocity)>.05)wake();
      }
      function resize(){const ratio=Math.min(devicePixelRatio,2);canvas.width=Math.round(stage.clientWidth*ratio);canvas.height=Math.round(stage.clientHeight*ratio);draw(true);}
      new ResizeObserver(resize).observe(stage);
      function stop(){velocity=0;}
      canvas.addEventListener('pointerdown',e=>{if(drag||e.button!==0)return;stop();drag={id:e.pointerId,x:e.clientX,time:e.timeStamp};canvas.setPointerCapture(e.pointerId);canvas.classList.add('pointer-focused');canvas.focus({preventScroll:true});});
      canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const change=(drag.x-e.clientX)/Math.max(stage.clientWidth,1)*count,dt=Math.max(.008,(e.timeStamp-drag.time)/1000);position+=change;if(Math.abs(change)>.06)section.classList.add('orbit-explored');velocity=Math.max(-count*.65,Math.min(count*.65,change/dt));drag={id:e.pointerId,x:e.clientX,time:e.timeStamp};draw();});
      function release(e){if(!drag||drag.id!==e.pointerId)return;if(e.type!=='pointerup'||e.timeStamp-drag.time>100||reduced.matches)velocity=0;drag=null;last=0;wake();}
      canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
      canvas.addEventListener('keydown',e=>{canvas.classList.remove('pointer-focused');if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();section.classList.add('orbit-explored');stop();position+=e.key==='ArrowRight'?-1:1;draw();}else if(e.key==='Home'){e.preventDefault();stop();position=0;draw();status.textContent='Hat returned to the front.';}});
      new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;section.classList.toggle('orbit-visible',visible);last=0;if(!visible){stop();drag=null;if(frame)cancelAnimationFrame(frame);frame=0;}else wake();}).observe(stage);
      document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();drag=null;if(frame)cancelAnimationFrame(frame);frame=0;}last=0;});
      reduced.addEventListener('change',()=>{if(reduced.matches)stop();});
      toolbar.hidden=false;
      section.querySelector('#orbit-instructions').hidden=false;
      resize();section.classList.add('orbit-ready','photo-spin');
      status.textContent='360-degree AI hat preview ready. Drag left or right to explore.';
    }catch(error){
      host.replaceChildren();toolbar.hidden=true;
      status.textContent='The hat photo is shown. The rotation could not load.';
      console.warn('Hat sequence:',error.message);
    }finally{loading?.remove();stage.removeAttribute('aria-busy');}
  }
  // Keep the large rotation sequence out of the entrance's download/decode budget.
  if(document.documentElement.classList.contains('intro-pending')) {
    document.addEventListener('ln:intro-complete',load,{once:true});
  } else load();
})();
