(()=>{'use strict';
const section=document.querySelector('.zoom-journey'),layers=[...section.querySelectorAll('.zoom-photo')],dots=[...section.querySelectorAll('.zoom-dots button')],buy=document.querySelector('.zoom-buy'),motion=matchMedia('(prefers-reduced-motion: reduce)');let frame=0;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
// A centred 20% inset reveals more of the current photo, then expands into the next.
// Every layer shares the same frame and crop, so its composition stays continuous.
const zoomRatio=5;
function paint(){frame=0;const distance=Math.max(1,section.offsetHeight-innerHeight);const rawDepth=clamp(-section.getBoundingClientRect().top/distance*4.65,0,4);
// Browser scroll positions round to pixels; keep a selected photo exactly at its stop.
const nearest=Math.round(rawDepth),depth=Math.abs(rawDepth-nearest)<=4.65/distance?nearest:rawDepth;
const current=motion.matches?Math.round(depth):Math.min(4,Math.floor(depth));layers.forEach((el,i)=>{el.style.visibility=(motion.matches?i===Math.round(depth):i>=current)?'visible':'hidden';el.style.transform=`scale(${motion.matches?1:Math.pow(zoomRatio,depth-i)})`;el.style.zIndex=i+1;});dots.forEach((el,i)=>el.setAttribute('aria-current',String(i===current)));section.querySelector('[data-zoom-hint]').textContent=depth>=4?'Scroll to shop':'Scroll to explore';}
function schedule(){if(!frame)frame=requestAnimationFrame(paint)}
addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);motion.addEventListener('change',schedule);paint();
function travel(top){window.scrollTo({top,behavior:motion.matches?'instant':'smooth'})}
dots.forEach((button,i)=>button.addEventListener('click',()=>travel(scrollY+section.getBoundingClientRect().top+(section.offsetHeight-innerHeight)*i/4.65)));
document.querySelectorAll('.zoom-revisit').forEach(a=>a.addEventListener('click',e=>{const dest=document.querySelector(a.getAttribute('href'));if(dest){e.preventDefault();travel(scrollY+dest.getBoundingClientRect().top);}}));
new IntersectionObserver(entries=>entries.forEach(e=>buy.classList.toggle('is-visible',e.isIntersecting)),{threshold:.12}).observe(buy);
let selected=1;const add=buy.querySelector('[data-zoom-add]'),less=buy.querySelector('[data-zoom-less]'),more=buy.querySelector('[data-zoom-more]'),output=buy.querySelector('[data-zoom-quantity]');
function render(state=window.LosNinosBag?.getState()){if(!state)return;const {quantity,catalog,catalogPhase,pending}=state;const available=catalog?Math.max(0,Math.min(state.limit,state.available)):0;const ready=catalogPhase==='ready'&&catalog?.acceptingOrders;selected=quantity>0?quantity:clamp(selected,1,Math.max(1,available));output.textContent=selected;buy.querySelector('[data-zoom-quantity-label]').textContent=quantity?'In your bag':'Quantity';less.disabled=!ready||selected<=1||pending;more.disabled=!ready||selected>=available||pending;add.dataset.addQuantity=selected;add.toggleAttribute('data-bag-open',quantity>0&&!pending);add.disabled=!!pending||catalogPhase==='loading'||(!quantity&&catalogPhase==='ready'&&(!ready||!available));const unit=catalog?.product.priceCents;buy.querySelector('.zoom-price b').textContent=unit?new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(unit/100):'$30';add.querySelector('[data-add-label]').textContent=pending?'Added to bag':catalogPhase==='loading'?'Checking availability…':quantity?'View bag':catalogPhase==='error'?'Retry availability':!ready||!available?'Unavailable':selected===1?'Add to bag':`Add ${selected} hats`;}
function change(delta){const state=window.LosNinosBag?.getState();if(state?.quantity>0)window.LosNinosBag.setQuantity(state.quantity+delta);else{selected+=delta;render();}}
less.addEventListener('click',()=>change(-1));more.addEventListener('click',()=>change(1));document.addEventListener('ln:bag-render',e=>render(e.detail));render();
})();
