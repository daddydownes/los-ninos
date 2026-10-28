(() => {
  'use strict';
  const options = [
    { id: '01', time: 0, name: 'First glance', detail: 'The newer start, at the first frame of this shot.' },
    { id: '02', time: .5, name: 'Looking left', detail: 'The previous opening, now restored.', recommended: true },
    { id: '03', time: .9, name: 'Later profile', detail: 'A more settled pose and a quicker cut into the street.' },
  ].map(option => ({...option, src:'assets/film/preview.mp4', mobileSrc:'assets/film/preview-mobile.mp4'}));
  const frames = Array.from({ length: 39 }, (_, number) => {
    const label = String(number).padStart(2, '0');
    return { id: `frame-${label}`, frame: number, time: number / 30,
      name: `Frame ${label}`, src:'assets/film/preview.mp4', mobileSrc:'assets/film/preview-mobile.mp4', poster: `assets/film/opening-frame-${label}.jpg`,
      mobilePoster: `assets/film/opening-frame-${label}-mobile.jpg` };
  });
  const car = {
    id: 'car', time: .15, name: 'In the car',
    poster: 'assets/film/car-opening.jpg', mobilePoster: 'assets/film/car-opening-mobile.jpg',
    src: 'assets/film/car-opening.mp4', mobileSrc: 'assets/film/car-opening-mobile.mp4',
  };
  const story = {
    id: 'story', time: 0, name: 'The complete moments',
    poster: 'assets/film/story-cut.jpg', mobilePoster: 'assets/film/story-cut-mobile.jpg',
    src: 'assets/film/story-cut.mp4', mobileSrc: 'assets/film/story-cut-mobile.mp4',
  };
  const models = [
    {id:'model',time:20/30,name:'Full scene',sourceFrame:1563},
    {id:'portrait',time:199/30,name:'Portrait',sourceFrame:1742},
    {id:'campaign',time:0,name:'Portrait to full film',sourceFrame:1563,posterId:'portrait',duration:421/30,src:'assets/film/campaign.mp4',mobileSrc:'assets/film/campaign-mobile.mp4'},
  ].map(option=>({...option,poster:`assets/film/model-${option.posterId||option.id}.jpg`,
    mobilePoster:`assets/film/model-${option.posterId||option.id}-mobile.jpg`,
    src:option.src||'assets/film/continuous.mp4',mobileSrc:option.mobileSrc||'assets/film/continuous-mobile.mp4'}));
  const choice = new URL(location.href).searchParams.get('opening');
  window.LosNinosFilmOpenings = Object.freeze({
    options, frames, story, models,
    selected: [car,story,...models,...options,...frames].find(option=>option.id===choice)||models[2],
  });
})();
