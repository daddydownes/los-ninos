(() => {
  'use strict';
  const studies = [...document.querySelectorAll('.study')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function replay(study) {
    if (reduced.matches) return;
    study.classList.remove('is-playing');
    // Flush only this tiny sample so the one-shot CSS animations can restart.
    void study.offsetWidth;
    study.classList.add('is-playing');
  }
  studies.forEach(study => {
    study.querySelectorAll('button').forEach(button => button.addEventListener('click', () => replay(study)));
  });
  document.querySelector('.replay-all').addEventListener('click', () => studies.forEach(replay));
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      replay(entry.target);
      observer.unobserve(entry.target);
    });
  }, { threshold: .65 });
  // All four use the same cached local fonts; wait for them before comparing motion.
  document.fonts.ready.then(() => studies.forEach(study => observer.observe(study)));
})();
