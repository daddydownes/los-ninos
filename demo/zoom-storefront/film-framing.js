/* Campaign cut timings and rationale are recorded in docs/video-framing.md. */
(() => {
  const video = document.querySelector('#preview');
  if (!video || window.LosNinosFilmOpenings?.selected?.id !== 'campaign') return;
  const START = 152 / 30;
  const END = 286 / 30;
  let callback = null;
  function update(time = video.currentTime) {
    video.classList.toggle('film-raised-framing', time >= START && time < END);
  }
  function cancel() {
    if (callback !== null) video.cancelVideoFrameCallback(callback);
    callback = null;
  }
  function track() {
    if (!video.requestVideoFrameCallback || callback !== null) return;
    callback = video.requestVideoFrameCallback((_now, frame) => {
      callback = null;
      update(frame.mediaTime);
      if (!video.paused && !video.ended) track();
    });
  }
  video.addEventListener('playing', () => { update(); track(); });
  for (const name of ['loadeddata', 'seeked', 'timeupdate', 'emptied']) {
    video.addEventListener(name, () => update());
  }
  for (const name of ['pause', 'ended']) {
    video.addEventListener(name, () => { cancel(); update(); });
  }
  window.addEventListener('pagehide', cancel);
  update();
})();
