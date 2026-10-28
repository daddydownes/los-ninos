/* One coherent model. No image swapping, crossfades, or drag requirement. */
(() => {
  'use strict';
  const section = document.querySelector('[data-orbit]');
  if (!section) return;
  const stage = section.querySelector('[data-orbit-stage]');
  const host = section.querySelector('[data-orbit-canvas]');
  const status = section.querySelector('[data-orbit-status]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionPreview = document.querySelector('[data-motion-preview]');
  const reduced = () => motion.matches || !!motionPreview?.checked;
  let requested = false;
  let attempt = 0;

  async function load() {
    if (requested) return;
    requested = true;
    const attemptId = ++attempt;
    section.querySelector('.orbit-retry')?.remove();
    stage.setAttribute('aria-busy', 'true');
    status.textContent = 'Loading the 360-degree preview.';
    const loading = document.createElement('div');
    loading.className = 'spin-loading';
    loading.innerHTML = '<span>Loading the 360° preview…</span>';
    stage.append(loading);
    let renderer, model, environment;
    let cleanup = () => {};
    let disposed = false;
    const events = new AbortController();
    try {
      const [THREE, {createHat}] = await Promise.all([
        import('/rotation-vendor/three.module.js'),
        import('/hat-model-3d.js')
      ]);
      renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-3,3,2,-2,.1,30);
      camera.position.set(0,2.65,9);
      camera.lookAt(0,0,0);

      // Broad studio panels produce soft fabric highlights as real surfaces turn.
      const studio = new THREE.Scene();
      studio.background = new THREE.Color(.07,.075,.09);
      const softboxes = [];
      function softbox(x,y,z,w,h,power) {
        const material = new THREE.MeshBasicMaterial({color:new THREE.Color(power,power,power),side:THREE.DoubleSide});
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);
        panel.position.set(x,y,z);panel.lookAt(0,0,0);studio.add(panel);softboxes.push(panel);
      }
      softbox(-3,4,4,4,5,3);
      softbox(4,2,1,3,4,1.4);
      softbox(1,3,-4,3,3,2.2);
      const pmrem = new THREE.PMREMGenerator(renderer);
      environment = pmrem.fromScene(studio,0,.1,30);
      scene.environment = environment.texture;
      scene.environmentIntensity = .48;
      pmrem.dispose();
      softboxes.forEach(p=>{p.geometry.dispose();p.material.dispose();});
      scene.add(new THREE.HemisphereLight(0xeef2ff,0x283346,.65));
      const key = new THREE.DirectionalLight(0xfff9f0,3.8);
      key.position.set(-3,4,5);
      key.castShadow = true;
      Object.assign(key.shadow.camera,{left:-2.5,right:2.5,top:2.5,bottom:-2.5,near:.1,far:15});
      key.shadow.mapSize.set(2048,2048);key.shadow.bias=-.00015;key.shadow.normalBias=.006;
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xdbe8ff,2.3);
      rim.position.set(4,2,-3);scene.add(rim);
      model = await createHat(THREE,renderer);
      scene.add(model);
      const canvas = renderer.domElement;
      canvas.setAttribute('role','img');
      canvas.setAttribute('aria-label','Automatically rotating 3D view of the OG Snapback');
      canvas.dataset.renderer = 'continuous-3d';
      canvas.style.touchAction = 'pan-y';
      let active = false, raf = 0, last = 0, phase = 0;
      let sampleTime = 0, sampleFrames = 0;
      const duration = 8000;
      function resize() {
        const rect = stage.getBoundingClientRect();
        const width = Math.max(1,rect.width),height = Math.max(1,rect.height);
        renderer.setSize(width,height,false);
        const aspect = width/height;
        // Fit around the crown axis, allowing the longest visor orientation.
        const viewHeight = Math.max(3.5,4.8/aspect);
        camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;
        camera.top=viewHeight/2;camera.bottom=-viewHeight/2;
        camera.updateProjectionMatrix();
        wake();
      }
      function stop() { if(raf) cancelAnimationFrame(raf);raf=0;last=0;sampleTime=0;sampleFrames=0; }
      function wake() { if(!disposed&&!raf&&active&&!document.hidden)raf=requestAnimationFrame(paint); }
      function paint(time) {
        raf=0;
        if(disposed||!active||document.hidden)return;
        if(reduced())phase=0;
        else if(last)phase=(phase+Math.min(time-last,60)/duration)%1;
        last=time;
        model.rotation.y=phase*Math.PI*2;
        renderer.render(scene,camera);
        if(!sampleTime)sampleTime=time;
        sampleFrames++;
        if(time-sampleTime>=500||reduced()) {
          canvas.dataset.yaw=(phase*360).toFixed(1);
          canvas.dataset.fps=String(Math.round(sampleFrames*1000/Math.max(1,time-sampleTime)));
          canvas.dataset.triangles=String(renderer.info.render.triangles);
          canvas.dataset.drawCalls=String(renderer.info.render.calls);
          sampleTime=time;sampleFrames=0;
        }
        if(!reduced())wake();
      }
      const ro = new ResizeObserver(resize);
      const io = new IntersectionObserver(entries=>{
        active=entries[0].isIntersecting&&entries[0].intersectionRatio>=.01;
        canvas.dataset.running=String(active&&!document.hidden&&!reduced());
        if(active)wake();else stop();
      },{threshold:.01});
      function motionChanged(){stop();if(reduced())phase=0;canvas.dataset.running=String(active&&!document.hidden&&!reduced());wake();}
      motion.addEventListener('change',motionChanged,{signal:events.signal});
      motionPreview?.addEventListener('change',motionChanged,{signal:events.signal});
      document.addEventListener('visibilitychange',()=>{
        canvas.dataset.running=String(active&&!document.hidden&&!reduced());
        if(document.hidden)stop();else wake();
      },{signal:events.signal});
      cleanup = () => {
        disposed=true;stop();events.abort();ro.disconnect();io.disconnect();
        const textures=new Set(),materials=new Set();
        model?.traverse(object=>{
          object.geometry?.dispose();
          if(object.material)materials.add(object.material);
        });
        materials.forEach(material=>{Object.values(material).forEach(v=>{if(v?.isTexture)textures.add(v);});material.dispose();});
        textures.forEach(t=>t.dispose());environment?.dispose();key.shadow.map?.dispose();renderer?.dispose();
      };
      canvas.addEventListener('webglcontextlost',event=>{
        event.preventDefault();cleanup();showFallback('The rotation paused. You can retry below.');
      },{signal:events.signal});
      host.replaceChildren(canvas);
      resize();
      // Prepare shaders before replacing the sharp poster.
      if(renderer.compileAsync)await renderer.compileAsync(scene,camera);
      if(disposed)return;
      renderer.render(scene,camera);
      canvas.dataset.triangles=String(renderer.info.render.triangles);
      canvas.dataset.drawCalls=String(renderer.info.render.calls);
      section.classList.add('orbit-ready','continuous-rotation');
      section.classList.remove('photo-spin');
      ro.observe(stage);io.observe(stage);
      status.textContent='360-degree hat preview ready.';
    } catch(error) {
      if(disposed)return;
      cleanup();renderer?.dispose();environment?.dispose();
      showFallback('The hat photo is shown. The rotation could not load.');
      console.warn('Hat rotation:',error.message);
    } finally {
      loading.remove();if(attemptId===attempt)stage.removeAttribute('aria-busy');
    }
  }
  function showFallback(message) {
    section.querySelector('.orbit-retry')?.remove();
    host.replaceChildren();
    section.classList.remove('orbit-ready','continuous-rotation');
    status.textContent=message;
    requested=false;
    const retry=document.createElement('button');retry.className='orbit-retry';retry.type='button';retry.textContent='Retry rotation';
    retry.addEventListener('click',load,{once:true});stage.append(retry);
  }
  function prepare() {
    const loader=new IntersectionObserver(entries=>{
      if(entries[0].isIntersecting){loader.disconnect();load();}
    },{rootMargin:'600px 0px'});
    loader.observe(stage);
  }
  if(document.documentElement.classList.contains('intro-pending'))document.addEventListener('ln:intro-complete',prepare,{once:true});
  else prepare();
})();
