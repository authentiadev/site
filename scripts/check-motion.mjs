import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'js/advisory.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'content/home.html'), 'utf8');
const attrs = text => Object.fromEntries([...text.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(match => [match[1], match[2] || '']));
const definitions = [...home.matchAll(/<video\b([^>]*)>([\s\S]*?)<\/video>/g)].map(match => ({
  attributes: attrs(match[1]),
  sources: [...match[2].matchAll(/<source\b([^>]*)>/g)].map(item => attrs(item[1]))
}));
assert.equal(definitions.length, 3);
assert.equal(definitions.filter(video => Object.hasOwn(video.attributes, 'data-deferred-video')).length, 2);
assert.ok(Object.hasOwn(definitions[0].attributes, 'autoplay'));
assert.ok(definitions[0].sources.every(item => item.src && !item['data-src']));
for (const video of definitions.slice(1)) {
  assert.equal(video.attributes.preload, 'none');
  assert.ok(!Object.hasOwn(video.attributes, 'autoplay'));
  assert.ok(video.attributes.poster);
  for (const item of video.sources) {
    assert.ok(item['data-src'] && !item.src);
    assert.match(item.type, /^video\/(mp4|webm)$/);
    assert.ok(fs.existsSync(path.join(root, item['data-src'])));
  }
}

class Element extends EventTarget {
  constructor(attributes = {}) { super(); this.attributes = new Map(Object.entries(attributes)); }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  click() { this.dispatchEvent(new Event('click')); }
}
class Video extends Element {
  constructor(definition) {
    super(definition.attributes);
    this.sources = definition.sources.map(item => new Element(item));
    this.autoplay = this.hasAttribute('autoplay');
    this.preload = this.getAttribute('preload');
    this.paused = true;
    this.playCalls = 0;
    this.loadCalls = 0;
  }
  querySelectorAll(selector) {
    assert.equal(selector, 'source[data-src]');
    return this.sources.filter(item => item.hasAttribute('data-src'));
  }
  play() { this.playCalls++; this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve(); }
  pause() { this.paused = true; }
  load() { this.loadCalls++; }
}
function setup({ reduced = false, intersection = true } = {}) {
  const videos = definitions.map(definition => new Video(definition));
  const motion = new Element();
  const preference = new EventTarget();
  preference.matches = reduced;
  preference.change = matches => {
    preference.matches = matches;
    const event = new Event('change');
    event.matches = matches;
    preference.dispatchEvent(event);
  };
  const observers = [];
  const window = { matchMedia: () => preference };
  if (intersection) window.IntersectionObserver = class {
    constructor(callback, options) { this.callback = callback; this.options = options; this.observed = new Set(); observers.push(this); }
    observe(video) { this.observed.add(video); }
    unobserve(video) { this.observed.delete(video); }
    approach(video, isIntersecting = true) { this.callback([{ target: video, isIntersecting }]); }
  };
  const document = {
    querySelector: selector => selector === '[data-motion-toggle]' ? motion : null,
    querySelectorAll: selector => selector === 'video' ? videos : []
  };
  vm.runInNewContext(source, { window, document }, { filename: 'advisory.js' });
  return { videos, motion, preference, observer: observers[0] };
}
const loaded = video => video.sources.every(item => item.hasAttribute('src') && !item.hasAttribute('data-src'));

{
  const { videos: [hero, first, second], observer } = setup();
  assert.ok(hero.playCalls > 0);
  assert.equal(first.loadCalls + second.loadCalls, 0, 'offscreen videos must not request their media');
  assert.equal(first.playCalls + second.playCalls, 0);
  assert.equal(observer.observed.size, 2);
  assert.equal(observer.options.rootMargin, '500px 0px');
  observer.approach(first);
  assert.equal(first.loadCalls, 1);
  assert.ok(loaded(first));
  assert.equal(first.paused, false);
  assert.equal(observer.observed.has(first), false);
  assert.equal(second.loadCalls, 0);
  observer.approach(first);
  assert.equal(first.loadCalls, 1, 'a repeated observer notification must not reload media');
}
{
  const { videos: [, first, second], motion, observer } = setup();
  motion.click();
  observer.approach(first);
  assert.equal(first.loadCalls, 0, 'pause must prevent loading even when a video approaches');
  motion.click();
  assert.ok(loaded(first), 'manual resume must activate a nearby deferred video');
  assert.equal(first.paused, false);
  assert.equal(second.loadCalls, 0, 'manual resume must not load a distant video');
}
{
  const { videos: [, first], motion, observer } = setup();
  motion.click();
  observer.approach(first);
  observer.approach(first, false);
  motion.click();
  assert.equal(first.loadCalls, 0, 'an offscreen video must not load from a stale nearby state');
}
{
  const { videos, preference, observer } = setup();
  observer.approach(videos[1]);
  preference.change(true);
  assert.ok(videos.every(video => video.paused));
  observer.approach(videos[2]);
  assert.equal(videos[2].loadCalls, 0);
  preference.change(false);
  assert.ok(videos.every(video => !video.paused && video.autoplay));
  assert.equal(videos[1].loadCalls, 1);
  assert.equal(videos[2].loadCalls, 1);
}
{
  const { videos, observer, motion } = setup({ reduced: true });
  observer.approach(videos[1]);
  assert.ok(videos.every(video => video.playCalls === 0 && video.paused));
  assert.equal(videos[1].loadCalls, 0);
  motion.click();
  assert.ok(loaded(videos[1]), 'explicit play may override the initial reduced-motion pause');
  assert.equal(videos[2].loadCalls, 0);
}
{
  const normal = setup({ intersection: false });
  assert.ok(normal.videos.slice(1).every(loaded), 'fallback browsers must retain playback');
  const reduced = setup({ intersection: false, reduced: true });
  assert.ok(reduced.videos.every(video => video.loadCalls === 0));
  reduced.motion.click();
  assert.ok(reduced.videos.slice(1).every(loaded));
}
{
  const { videos: [, first] } = setup();
  first.play();
  assert.equal(first.paused, true, 'another page script must not play an unloaded deferred video');
  assert.equal(first.loadCalls, 0);
  assert.ok(first.sources.every(item => !item.hasAttribute('src')));
}
console.log('Motion checks passed: deferred media, near-viewport loading, pause/resume, reduced motion, fallback, and external play guard.');
