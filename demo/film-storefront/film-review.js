(() => {
  const video=document.querySelector('#review'), screen=document.querySelector('.screen');
  let edit='story',format='desktop';
  const start=()=>edit==='story'?0:.5;
  function select(){
    video.pause();
    const base=edit==='story'?'story-cut':'preview', suffix=format==='phone'?'-mobile':'';
    video.poster=`assets/film/${edit==='story'?'story-cut':'opening-02'}${suffix}.jpg`;
    video.src=`assets/film/${base}${suffix}.mp4`;video.load();
    screen.classList.toggle('phone',format==='phone');
    document.querySelectorAll('[data-edit]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.edit===edit)));
    document.querySelectorAll('[data-format]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.format===format)));
    document.querySelector('.chapters').hidden=edit!=='story';
    document.querySelector('#full').href=edit==='story'?'./?opening=story':'./?opening=02';
    document.querySelector('#note').textContent=edit==='story'?'Original speed. Seven camera angles, with the walk, boot opening and closing kept in sequence. No artificial frames or repeated gestures.':'Previous edit: the looking-left opening, short inserts and the jump back to putting the hat on.';
    video.dataset.events='[]';
  }
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{edit=b.dataset.edit;select()});
  document.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>{format=b.dataset.format;select()});
  document.querySelector('#play').onclick=()=>{video.currentTime=start();video.play().catch(()=>{})};
  document.querySelectorAll('[data-time]').forEach(b=>b.onclick=()=>{video.pause();video.currentTime=Number(b.dataset.time)});
  video.addEventListener('loadedmetadata',()=>{video.currentTime=start();update()});
  function update(){document.querySelector('#time').textContent=`${video.currentTime.toFixed(2)} / ${(video.duration||0).toFixed(2)}`}
  video.addEventListener('timeupdate',update);
  for(const type of ['playing','waiting','ended','error'])video.addEventListener(type,()=>{
    const events=JSON.parse(video.dataset.events||'[]');events.push({type,time:video.currentTime});video.dataset.events=JSON.stringify(events.slice(-30));
  });
})();
