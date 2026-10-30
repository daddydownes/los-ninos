import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';

const root=process.env.FILM_SOURCE_DIR;
const source=name=>readFileSync(root?resolve(root,name):new URL(`../../demo/zoom-storefront/${name}`,import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
function target(extra={}){
  const handlers=new Map();
  return Object.assign({
    addEventListener(name,fn){if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn)},
    removeEventListener(name,fn){handlers.set(name,(handlers.get(name)||[]).filter(item=>item!==fn))},
    emit(name,detail={}){for(const fn of [...(handlers.get(name)||[])])fn({type:name,...detail})},
  },extra);
}
function element(extra={}){
  const classes=new Set(),attrs=new Map(),children=new Map();
  return target(Object.assign({dataset:{},style:{},clientWidth:1200,clientHeight:800,hidden:false,textContent:'',
    classList:{contains:x=>classes.has(x),add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),
      toggle(x,force){const enabled=force===undefined?!classes.has(x):Boolean(force);if(enabled)classes.add(x);else classes.delete(x);return enabled}},
    setAttribute(k,v){attrs.set(k,String(v))},getAttribute(k){return attrs.get(k)},removeAttribute(k){attrs.delete(k);if(k==='src')this.src=''},
    querySelector(selector){if(!children.has(selector))children.set(selector,element());return children.get(selector)},
    getBoundingClientRect(){return {left:900,top:500,width:210,height:210,bottom:1500}},
  },extra));
}
function clock(){
  let now=0,id=0;const tasks=new Map();
  return {now:()=>now,setTimeout(fn,delay){tasks.set(++id,{fn,at:now+delay});return id},clearTimeout(key){tasks.delete(key)},
    async advance(ms){const end=now+ms;for(;;){const next=[...tasks].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;tasks.delete(next[0]);next[1].fn();await flush()}now=end;await flush()},
  };
}
function stream(){
  let pending;const queue=[];
  const deliver=item=>{if(pending){const p=pending;pending=null;p(item)}else queue.push(item)};
  return {reader:{read:()=>queue.length?Promise.resolve(queue.shift()):new Promise(resolve=>{pending=resolve}),cancel:async()=>deliver({done:true}),releaseLock(){}},
    chunk:()=>deliver({done:false,value:new Uint8Array([1,2,3])}),end:()=>deliver({done:true}),
  };
}
function harness({reduce=false,saveData=false}={}){
  const time=clock(),elements=new Map(),queries=new Map(),requests=[],raf=new Map();let rafId=0,playError=null,plays=0;
  const get=selector=>{if(!elements.has(selector))elements.set(selector,element());return elements.get(selector)};
  const video=get('#preview');Object.assign(video,{dataset:{src:'desktop.mp4',mobileSrc:'mobile.mp4'},currentTime:0,readyState:0,paused:true,seeking:false,
    pause(){this.paused=true},load(){},play(){plays++;this.paused=Boolean(playError);return playError?Promise.reject(playError):Promise.resolve()},
    requestVideoFrameCallback:()=>++rafId,cancelVideoFrameCallback(){},
  });
  const document=target({hidden:false,documentElement:element({matches:()=>false}),querySelector:get,querySelectorAll:selector=>selector==='.card-copy'?[element()]:[]});
  const context=target({document,navigator:{connection:{saveData}},URL:{createObjectURL:()=>`blob:${requests.length}`,revokeObjectURL(){}},Blob,AbortController,
    matchMedia:query=>{if(!queries.has(query))queries.set(query,target({matches:query.includes('prefers-reduced-motion')&&reduce}));return queries.get(query)},
    setTimeout:time.setTimeout,clearTimeout:time.clearTimeout,requestAnimationFrame:fn=>{raf.set(++rafId,fn);return rafId},cancelAnimationFrame:id=>raf.delete(id),
    performance:{now:time.now},ResizeObserver:class{observe(){}},IntersectionObserver:class{observe(){}},
    fetch:(url,{signal})=>new Promise(resolve=>requests.push({url,signal,resolve})),
  });
  context.window=context;context.window.scrollTo=()=>{};vm.createContext(context);vm.runInContext(source('film-motion.js'),context);
  const paint=()=>{const callbacks=[...raf.values()];raf.clear();callbacks.forEach(fn=>fn(time.now()))};
  const respond=async(index=0)=>{const body=stream();requests[index].resolve({ok:true,headers:{get:()=> 'video/mp4'},body:{getReader:()=>body.reader}});await flush();return body};
  const loaded=async()=>{video.readyState=4;video.emit('canplay');await flush()};
  paint();
  return {time,requests,video,context,document,button:get('.film-play'),get,respond,loaded,paint,changeMotion:value=>{const m=queries.get('(prefers-reduced-motion:reduce)');m.matches=value;m.emit('change')},plays:()=>plays,setPlayError:e=>{playError=e},
    rotate:()=>{const media=queries.get('(max-width:700px) and (orientation:portrait)');media.matches=!media.matches;media.emit('change')},
  };
}

test('a progressing film download can exceed15seconds without losing the poster',async()=>{
  const h=harness(),body=await h.respond();
  for(let i=0;i<3;i++){await h.time.advance(25000);body.chunk();await flush();assert.equal(h.video.dataset.playback,'loading')}
  body.end();await flush();assert.equal(h.video.dataset.playback,'ready');assert.equal(h.requests[0].signal.aborted,false);
});
test('30seconds with no bytes aborts the download, then online retries it',async()=>{
  const h=harness();await h.respond();await h.time.advance(30000);
  assert.equal(h.video.dataset.playback,'still');assert.equal(h.requests[0].signal.aborted,true);
  h.context.emit('online');assert.equal(h.requests.length,2);assert.equal(h.video.dataset.playback,'loading');
});
test('a continuously arriving download still respects the180second ceiling',async()=>{
  const h=harness(),body=await h.respond();
  for(let i=0;i<7;i++){await h.time.advance(25000);body.chunk();await flush()}
  await h.time.advance(5000);assert.equal(h.video.dataset.playback,'still');assert.equal(h.requests[0].signal.aborted,true);
});
test('an old response cannot cancel a new orientation download or its deadline',async()=>{
  const h=harness();h.rotate();assert.equal(h.requests.length,2);
  const body=await h.respond(1);h.requests[0].resolve({ok:false});await flush();
  await h.time.advance(25000);body.chunk();await flush();await h.time.advance(10000);
  assert.equal(h.video.dataset.playback,'loading');assert.equal(h.requests[1].signal.aborted,false);
  body.end();await flush();assert.equal(h.video.dataset.playback,'ready');
});
test('brief decode stalls recover, persistent stalls receive one retry then a still',async()=>{
  const h=harness(),body=await h.respond();body.chunk();body.end();await flush();await h.loaded();
  h.video.emit('waiting');await h.time.advance(500);assert.equal(h.video.src,'blob:1');
  h.video.emit('playing');await h.time.advance(5000);assert.equal(h.video.dataset.playback,'playing');assert.equal(h.plays(),1);
  h.video.emit('waiting');await h.time.advance(4000);assert.equal(h.plays(),2);assert.equal(h.video.src,'blob:1');
  await h.time.advance(8000);assert.equal(h.video.dataset.playback,'still');
});
test('autoplay denial retains the downloaded film and retries on a deliberate tap',async()=>{
  const h=harness(),body=await h.respond();body.chunk();body.end();await flush();
  h.setPlayError(Object.assign(new Error('Autoplay blocked'),{name:'NotAllowedError'}));await h.loaded();
  assert.equal(h.video.dataset.playback,'paused');assert.equal(h.video.src,'blob:1');
  h.context.emit('online');assert.equal(h.plays(),1);
  h.setPlayError(null);h.context.emit('pointerup');await flush();h.video.emit('playing');
  assert.equal(h.plays(),2);assert.equal(h.requests.length,1);assert.equal(h.video.dataset.playback,'playing');
});
test('a ready Blob rejected by Low Power Mode plays directly from its visible button',async()=>{
  const h=harness(),body=await h.respond();body.chunk();body.end();await flush();
  h.setPlayError(Object.assign(new Error('Low Power Mode'),{name:'NotAllowedError'}));await h.loaded();
  assert.equal(h.button.hidden,false);assert.equal(h.button.disabled,false);assert.equal(h.button.getAttribute('aria-label'),'Play film');
  const blob=h.video.src;h.setPlayError(null);
  h.context.emit('pointerup',{target:{closest:selector=>selector==='.film-controls'?{}:null}});
  assert.equal(h.plays(),1,'pointerup on the button must not play before click');
  h.button.emit('click');assert.equal(h.plays(),2,'play() is called synchronously in click');
  assert.equal(h.video.src,blob);assert.equal(h.requests.length,1);
  h.video.emit('playing');assert.equal(h.button.getAttribute('aria-label'),'Pause film');
  h.button.emit('click');assert.equal(h.video.paused,true);assert.equal(h.button.getAttribute('aria-label'),'Play film');
  h.context.emit('pointerup');h.context.emit('scroll');h.paint();assert.equal(h.plays(),2,'manual Pause survives generic page interactions');
});
for(const preference of ['reduce','saveData'])test(`${preference} avoids automatic video download and allows explicit opt-in`,async()=>{
  const h=harness({[preference]:true});assert.equal(h.requests.length,0);assert.equal(h.button.hidden,false);assert.equal(h.button.getAttribute('aria-label'),'Play film');
  h.button.emit('click');assert.equal(h.requests.length,1);assert.equal(h.button.getAttribute('aria-label'),'Loading film…');
  const body=await h.respond();body.chunk();body.end();await flush();
  h.setPlayError(Object.assign(new Error('Gesture needed after download'),{name:'NotAllowedError'}));await h.loaded();
  assert.equal(h.button.disabled,false);assert.equal(h.button.getAttribute('aria-label'),'Play film');
  h.setPlayError(null);h.button.emit('click');assert.equal(h.plays(),2);h.video.emit('playing');
  assert.equal(h.button.getAttribute('aria-label'),'Pause film');assert.equal(h.requests.length,1);
});
test('a failed download exposes Retry without requiring an unrelated tap',async()=>{
  const h=harness();h.requests[0].resolve({ok:false});await flush();
  assert.equal(h.button.hidden,false);assert.equal(h.button.getAttribute('aria-label'),'Retry film');
  h.button.emit('click');assert.equal(h.requests.length,2);assert.equal(h.button.disabled,true);
  const body=await h.respond(1);body.chunk();body.end();await flush();await h.loaded();h.video.emit('playing');
  assert.equal(h.video.dataset.playback,'playing');
});
test('reduced-motion explicit playback finishes once with Replay, while normal playback loops',async()=>{
  const h=harness({reduce:true});h.button.emit('click');const body=await h.respond();body.chunk();body.end();await flush();await h.loaded();h.video.emit('playing');
  h.video.currentTime=14;h.video.paused=true;h.video.emit('ended');
  assert.equal(h.plays(),1);assert.equal(h.button.getAttribute('aria-label'),'Replay film');
  h.video.emit('seeked');h.context.emit('pointerup');h.paint();assert.equal(h.plays(),1);
  h.button.emit('click');assert.equal(h.plays(),2);assert.equal(h.video.currentTime,0);
  const normal=harness(),normalBody=await normal.respond();normalBody.chunk();normalBody.end();await flush();await normal.loaded();normal.video.emit('playing');
  normal.video.currentTime=14;normal.video.paused=true;normal.video.emit('ended');normal.video.emit('seeked');
  assert.equal(normal.video.currentTime,0);assert.equal(normal.plays(),2);
});
test('enabling reduced motion pauses an existing opt-in and offers Play again',async()=>{
  const h=harness(),body=await h.respond();body.chunk();body.end();await flush();await h.loaded();h.video.emit('playing');
  h.changeMotion(true);assert.equal(h.video.paused,true);assert.equal(h.button.getAttribute('aria-label'),'Play film');
  h.button.emit('click');h.video.emit('playing');assert.equal(h.plays(),2);
  h.changeMotion(false);h.changeMotion(true);assert.equal(h.video.paused,true);assert.equal(h.button.getAttribute('aria-label'),'Play film');
  h.context.emit('pointerup');assert.equal(h.plays(),2);
});
test('an old play rejection cannot override a new orientation download',async()=>{
  const h=harness(),body=await h.respond();body.chunk();body.end();await flush();
  let reject;h.video.play=()=>{h.video.paused=false;return new Promise((_,no)=>{reject=no})};await h.loaded();
  h.rotate();reject(Object.assign(new Error('Old source'),{name:'NotAllowedError'}));await flush();
  assert.equal(h.requests.length,2);assert.equal(h.video.dataset.playback,'loading');assert.equal(h.button.hidden,true);
});
test('an unexpected browser pause exposes Play without treating bag pauses as policy failures',async()=>{
  const h=harness(),body=await h.respond();body.chunk();body.end();await flush();await h.loaded();h.video.emit('playing');
  h.video.paused=true;h.video.emit('pause');
  assert.equal(h.video.dataset.playback,'paused');assert.equal(h.button.hidden,false);assert.equal(h.button.getAttribute('aria-label'),'Play film');
  const blob=h.video.src;h.context.emit('scroll');h.paint();assert.equal(h.plays(),1);
  h.button.emit('click');assert.equal(h.plays(),2);assert.equal(h.video.src,blob);h.video.emit('playing');
  h.document.emit('ln:bag-visibility',{detail:{open:true}});h.video.emit('pause');
  assert.equal(h.video.paused,true);
  h.document.emit('ln:bag-visibility',{detail:{open:false}});assert.equal(h.plays(),3,'closing the bag resumes without another policy click');
  assert.equal(h.requests.length,1);
});
test('photo retry bypasses a failed srcset and restores focus after loading',async()=>{
  const time=clock(),image=element({complete:true,naturalWidth:0,src:'photo.webp',decode:async()=>{},focus(){document.activeElement=this}});
  image.setAttribute('src','photo.webp');image.setAttribute('srcset','photo-small.webp 800w, photo.webp 1600w');
  const retry=target({disabled:false,focus(){document.activeElement=this}}),error=element(),slot=element();
  slot.querySelector=s=>s==='img'?image:s==='.photo-error'?error:retry;
  const story={querySelectorAll:s=>s==='.photo-slot'?[slot]:[]};
  const document=target({querySelector:()=>story,documentElement:element(),baseURI:'http://127.0.0.1:8793/',body:{},activeElement:retry});
  class Image {decode(){return Promise.resolve()}removeAttribute(){}}
  const context={document,window:{},matchMedia:()=>({matches:true}),Image,URL,Date,setTimeout:time.setTimeout,clearTimeout:time.clearTimeout};
  vm.createContext(context);vm.runInContext(source('film-photos.js'),context);
  retry.emit('click');await flush();
  assert.equal(image.getAttribute('srcset'),undefined);assert.match(image.src,/photo\.webp\?retry=/);
  assert.equal(error.hidden,true);assert.equal(retry.disabled,false);assert.equal(document.activeElement,image);assert.equal(slot.getAttribute('aria-busy'),undefined);
});
