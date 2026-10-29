(() => {
  const menu = document.querySelector('.site-nav-menu');
  const toggle = document.querySelector('.site-menu-toggle');
  if (menu && toggle) {
    menu.dataset.enhanced = 'true';
    toggle.hidden = false;
    const close = () => { menu.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); };
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('is-open', open);
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.classList.contains('is-open')) { close(); toggle.focus(); } });
    document.addEventListener('click', event => { if (!event.target.closest('.site-navbar')) close(); });
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
  }
  const filters = document.querySelectorAll('[data-resource-filter]');
  const cards = document.querySelectorAll('[data-resource-kind]');
  filters.forEach(button => button.addEventListener('click', () => {
    const selected = button.dataset.resourceFilter;
    filters.forEach(filter => filter.setAttribute('aria-pressed', String(filter === button)));
    let visible = 0;
    cards.forEach(card => { card.hidden = selected !== 'All' && card.dataset.resourceKind !== selected; if (!card.hidden) visible++; });
    const count = document.querySelector('[data-resource-count]');
    if (count) count.textContent = `${visible} resource${visible === 1 ? '' : 's'}`;
  }));
  const videos = [...document.querySelectorAll('video')];
  const pendingVideos = new Set(videos.filter(video => video.hasAttribute('data-deferred-video')));
  const nearbyVideos = new Set();
  const motion = document.querySelector('[data-motion-toggle]');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = preference.matches;
  let observer = null;

  const playVideo = video => {
    if (paused || pendingVideos.has(video)) return;
    video.autoplay = true;
    const playback = video.play();
    if (playback && typeof playback.catch === 'function') playback.catch(() => {});
  };
  const loadNearbyVideo = video => {
    if (paused || !nearbyVideos.has(video) || !pendingVideos.has(video)) return;
    video.querySelectorAll('source[data-src]').forEach(source => {
      source.setAttribute('src', source.getAttribute('data-src'));
      source.removeAttribute('data-src');
    });
    pendingVideos.delete(video);
    nearbyVideos.delete(video);
    video.removeAttribute('data-deferred-video');
    video.preload = 'auto';
    video.autoplay = true;
    video.load();
    if (observer) observer.unobserve(video);
    playVideo(video);
  };
  const activateNearbyVideos = () => nearbyVideos.forEach(loadNearbyVideo);

  videos.forEach(video => video.addEventListener('play', () => {
    // Other page scripts must also respect the motion choice and unloaded sources.
    if (paused || pendingVideos.has(video)) video.pause();
  }));
  const setMotion = () => {
    videos.forEach(video => {
      if (paused) { video.autoplay = false; video.pause(); }
      else if (!pendingVideos.has(video)) playVideo(video);
    });
    if (motion) { motion.textContent = paused ? 'Play background videos' : 'Pause background videos'; motion.setAttribute('aria-pressed', String(paused)); }
  };
  setMotion();

  if (pendingVideos.size) {
    if (typeof window.IntersectionObserver === 'function') {
      observer = new window.IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            nearbyVideos.add(entry.target);
            loadNearbyVideo(entry.target);
          } else nearbyVideos.delete(entry.target);
        });
      }, { rootMargin: '500px 0px', threshold: 0 });
      pendingVideos.forEach(video => observer.observe(video));
    } else {
      // Older browsers retain background playback when motion is allowed.
      pendingVideos.forEach(video => nearbyVideos.add(video));
      activateNearbyVideos();
    }
  }

  if (motion) motion.addEventListener('click', () => {
    paused = !paused;
    setMotion();
    if (!paused) activateNearbyVideos();
  });
  const updatePreference = event => {
    paused = event.matches;
    setMotion();
    if (!paused) activateNearbyVideos();
  };
  if (typeof preference.addEventListener === 'function') preference.addEventListener('change', updatePreference);
  else if (typeof preference.addListener === 'function') preference.addListener(updatePreference);
})();
