import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const source = fs.readFileSync(fileURLToPath(new URL('../hat-rotation.js', import.meta.url)), 'utf8');
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };

function fixture(options = {}) {
  const controls = {imageFailure: false, holdVideo: false, playModes: [], ...options};
  const videos = [], images = [], draws = [], ios = [], ros = [], timers = new Map(), raf = new Map();
  let nextTimer = 1, nextRAF = 1, pixelReads = 0;
  class Element extends EventTarget {
    constructor(tag = 'div') {
      super(); Object.assign(this, {tagName: tag, children: [], parent: null, dataset: {}, style: {}, attributes: {}, hidden: false, className: '', textContent: ''});
      this.classList = {values: new Set(), add(...items) {items.forEach(x => this.values.add(x));}, remove(...items) {items.forEach(x => this.values.delete(x));}, contains(x) {return this.values.has(x);}, toggle(x, on) {on ? this.values.add(x) : this.values.delete(x);}};
    }
    append(...items) { for (const item of items) {item.remove(); this.children.push(item); item.parent = this;} }
    replaceChildren(...items) {for (const item of this.children) item.parent = null; this.children = []; this.append(...items);}
    remove() {if (this.parent) {this.parent.children = this.parent.children.filter(x => x !== this); this.parent = null;}}
    setAttribute(key, value) {this.attributes[key] = value;}
    removeAttribute(key) {delete this.attributes[key]; if (key === 'src') this.src = '';}
    querySelector(query) {return query === '.orbit-retry' ? this.children.find(x => x.className === 'orbit-retry') || this.children.map(x => x.querySelector(query)).find(Boolean) : null;}
    closest(query) {return query === '#worn' ? surround : null;}
    getBoundingClientRect() {return {width: 1000, height: 600};}
  }
  class Canvas extends Element {
    constructor() {super('canvas'); this.width = 300; this.height = 150;}
    getContext() {
      let lastSource;
      return {fillRect() {}, drawImage(...args) {lastSource = args[0]; draws.push(args);}, getImageData() {pixelReads++; return {data: lastSource?.tagName === 'video' ? [237, 235, 228, 255] : [238, 236, 229, 255]};}};
    }
  }
  class Picture extends Element {
    constructor() {super('img'); this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; images.push(this);}
    set src(value) {this.url = value; queueMicrotask(() => {if (controls.imageFailure) {this.dispatchEvent(new Event('error')); return;} this.complete = true; this.naturalWidth = 1440; this.naturalHeight = 960; this.dispatchEvent(new Event('load'));});}
  }
  class Video extends Element {
    constructor() {super('video'); Object.assign(this, {paused: true, readyState: 0, videoWidth: 0, videoHeight: 0, currentTime: 0, frames: new Map(), next: 1, pending: []}); videos.push(this);}
    load() {if (this.src && !controls.holdVideo) queueMicrotask(() => this.loaded());}
    loaded() {this.readyState = 2; this.videoWidth = this.src?.includes('mobile') ? 960 : 1440; this.videoHeight = this.videoWidth * 2 / 3; this.dispatchEvent(new Event('loadeddata'));}
    play() {
      const mode = controls.playModes.shift() || 'resolve';
      if (mode === 'denied') return Promise.reject(new DOMException('Gesture needed', 'NotAllowedError'));
      this.paused = false;
      if (mode === 'deferred') return new Promise((resolve, reject) => this.pending.push({resolve: () => {this.dispatchEvent(new Event('playing')); resolve();}, reject}));
      this.dispatchEvent(new Event('playing')); return Promise.resolve();
    }
    pause() {this.paused = true;}
    requestVideoFrameCallback(callback) {const id = this.next++; this.frames.set(id, callback); return id;}
    cancelVideoFrameCallback(id) {this.frames.delete(id);}
    present(time) {this.currentTime = time; const [id, callback] = [...this.frames][0] || []; if (callback) {this.frames.delete(id); callback(time * 1000, {mediaTime: time});}}
  }
  class Media extends EventTarget {constructor(matches = false) {super(); this.matches = matches;} toggle(value) {this.matches = value; this.dispatchEvent(new Event('change'));}}
  const motion = new Media(!!controls.reduced), compact = new Media();
  const section = new Element(), stage = new Element(), host = new Element(), status = new Element(), surround = new Element();
  section.append(stage); stage.append(host);
  const baseQuery = section.querySelector.bind(section);
  section.querySelector = query => ({'[data-orbit-stage]': stage, '[data-orbit-canvas]': host, '[data-orbit-status]': status}[query] || baseQuery(query));
  const document = new Element();
  Object.assign(document, {hidden: false, baseURI: 'http://localhost/', documentElement: new Element()});
  document.querySelector = query => query === '[data-orbit]' ? section : null;
  document.createElement = tag => tag === 'canvas' ? new Canvas() : tag === 'video' ? new Video() : new Element(tag);
  class IO {constructor(callback, settings) {this.callback = callback; this.settings = settings; ios.push(this);} observe() {} disconnect() {this.disconnected = true;}}
  class RO {constructor(callback) {this.callback = callback; ros.push(this);} observe() {}}
  const sandbox = {document, Image: Picture, IntersectionObserver: IO, ResizeObserver: RO, matchMedia: query => query.includes('prefers') ? motion : compact, devicePixelRatio: 2, URL, WeakMap, DOMException, AbortController, Promise,
    console: {warn() {}}, setTimeout(callback, delay) {const id = nextTimer++; timers.set(id, {callback, delay}); return id;}, clearTimeout(id) {timers.delete(id);},
    requestAnimationFrame(callback) {const id = nextRAF++; raf.set(id, callback); return id;}, cancelAnimationFrame(id) {raf.delete(id);}};
  vm.runInNewContext(source, sandbox);
  return {controls, videos, images, draws, ios, ros, timers, raf, section, stage, host, status, surround, motion, compact, document,
    canvas: () => host.children.find(x => x.tagName === 'canvas'), pixelReads: () => pixelReads,
    visible(value, ratio = value ? 1 : 0) {ios[0].callback([{isIntersecting: value, intersectionRatio: ratio}]);},
    load() {ios[1].callback([{isIntersecting: true, intersectionRatio: 1}]);},
    hidden(value) {document.hidden = value; document.dispatchEvent(new Event('visibilitychange'));},
    retry() {section.querySelector('.orbit-retry').dispatchEvent(new Event('click'));},
    fireTimeout(delay) {const entry = [...timers].find(([, value]) => value.delay === delay); assert.ok(entry, `Expected ${delay}ms timer`); timers.delete(entry[0]); entry[1].callback();}};
}

const f = fixture(); f.visible(true); f.load(); await flush();
let video = f.videos.at(-1), canvas = f.canvas();
check('Desktop starts with exactly one video-frame callback', canvas.dataset.source === 'photo-turn-hd.mp4' && video.frames.size === 1 && canvas.dataset.state === 'playing');
video.present(1.5);
check('Frame metadata advances and callback stays unique', canvas.dataset.frame === '45' && video.frames.size === 1);
check('Video paper sample updates canvas surround', f.surround.style.backgroundColor === 'rgb(237,235,228)');
const sampled = f.pixelReads(); video.present(2); video.present(2.5);
check('Paper samples are cached per source', f.pixelReads() === sampled);
f.motion.toggle(true);
check('Reduced motion restores sharp poster and poster paper', video.paused && !video.frames.size && canvas.dataset.frame === '0' && f.surround.style.backgroundColor === 'rgb(238,236,229)');
f.motion.toggle(false); await flush();
check('Motion resumes with one callback', !video.paused && video.frames.size === 1);
f.hidden(true); check('Hidden tab pauses and cancels callback', video.paused && video.frames.size === 0);
f.hidden(false); await flush(); check('Visible tab resumes once', video.frames.size === 1);
f.visible(true, 0); check('Zero-area intersection pauses', video.paused && video.frames.size === 0);
f.visible(true, 1); await flush(); check('Positive-area intersection resumes', video.frames.size === 1);
video.dispatchEvent(new Event('waiting')); check('Buffering installs bounded stall timeout', [...f.timers.values()].some(x => x.delay === 25000));
f.hidden(true); check('Hidden pause cancels stall timeout', ![...f.timers.values()].some(x => x.delay === 25000));
f.hidden(false); await flush(); video.dispatchEvent(new Event('error'));
check('Runtime failure preserves poster and retry', canvas.dataset.frame === '0' && canvas.dataset.state === 'error' && !!f.section.querySelector('.orbit-retry') && f.host.children.includes(canvas));
f.compact.matches = true; f.controls.playModes.push('denied'); f.retry(); await flush(); video = f.videos.at(-1);
check('Retry selects mobile without duplicate observers', canvas.dataset.source === 'photo-turn-mobile.mp4' && f.ios.length === 2 && f.ros.length === 1);
check('Autoplay denial offers direct play action', canvas.dataset.state === 'awaiting-play' && f.section.querySelector('.orbit-retry').textContent === 'Play rotation');
f.retry(); await flush(); check('Direct play action succeeds', canvas.dataset.state === 'playing' && video.frames.size === 1);
f.motion.toggle(true); video.requestVideoFrameCallback = undefined; video.cancelVideoFrameCallback = undefined; f.motion.toggle(false); await flush();
check('rAF fallback remains single', f.raf.size === 1); f.motion.toggle(true); check('rAF fallback cancels', f.raf.size === 0);

const timeout = fixture({holdVideo: true}); timeout.visible(true); timeout.load(); await flush(); const old = timeout.videos[0];
timeout.fireTimeout(20000); await flush();
check('Load timeout preserves poster and exposes retry', timeout.canvas().dataset.state === 'error' && !!timeout.section.querySelector('.orbit-retry'));
timeout.controls.holdVideo = false; timeout.retry(); await flush(); old.loaded(); old.dispatchEvent(new Event('error')); await flush();
check('Late events from timed-out media cannot damage retry', timeout.canvas().dataset.state === 'playing' && timeout.videos.at(-1).frames.size === 1 && !timeout.section.querySelector('.orbit-retry'));
timeout.motion.toggle(true);

const race = fixture({playModes: ['deferred']}); race.visible(true); race.load(); await flush(); const stale = race.videos[0];
stale.dispatchEvent(new Event('error')); race.retry(); await flush(); stale.pending[0].reject(new DOMException('Old play cancelled', 'AbortError')); await flush();
check('Stale play rejection cannot fail a replacement session', race.canvas().dataset.state === 'playing' && race.videos.at(-1).frames.size === 1); race.motion.toggle(true);

const initialReduced = fixture({reduced: true}); initialReduced.visible(true); initialReduced.load(); await flush();
check('Initial reduced motion loads only the poster', initialReduced.videos.length === 0 && initialReduced.canvas().dataset.state === 'reduced-motion');
initialReduced.motion.toggle(false); await flush(); check('Disabling initial reduced motion loads video once', initialReduced.videos.length === 1 && initialReduced.videos[0].frames.size === 1); initialReduced.motion.toggle(true);

const badPoster = fixture({imageFailure: true}); badPoster.visible(true); badPoster.load(); await flush();
check('Poster failure retains original still and retry', badPoster.host.children.length === 0 && !badPoster.section.classList.contains('orbit-ready') && !!badPoster.section.querySelector('.orbit-retry'));
badPoster.controls.imageFailure = false; badPoster.retry(); await flush(); check('Poster failure retry recovers', badPoster.canvas().dataset.state === 'playing'); badPoster.motion.toggle(true);

const thresholds = f.ios[0].settings?.threshold;
console.log(JSON.stringify({passed: checks.length, checks, playbackObserverThreshold: thresholds ?? 0, positiveAreaThresholdConfigured: Array.isArray(thresholds) ? thresholds.some(x => x > 0) : thresholds > 0}, null, 2));
