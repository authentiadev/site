import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(directory, '../js/analytics.js'), 'utf8');
const measurementId = 'G-TEST12345';
const lifetime = 90 * 24 * 60 * 60 * 1000;
const initialTime = Date.UTC(2026, 9, 28, 12);

class Element {
  constructor(tag, owner) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = owner;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.isConnected = false;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      this.dataset[key] = String(value);
    }
  }
  appendChild(child) {
    child.parentElement = this;
    child.isConnected = this.isConnected;
    this.children.push(child);
    return child;
  }
  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(listener);
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    this.isConnected = false;
  }
  focus() { this.ownerDocument.activeElement = this; }
  matches(selector) {
    if (selector === 'a[href]') return this.tagName === 'A' && Boolean(this.href);
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector.startsWith('[')) {
      const name = selector.slice(1, -1);
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
        return Object.hasOwn(this.dataset, key);
      }
      return this.attributes.has(name);
    }
    return this.tagName.toLowerCase() === selector;
  }
  closest(selectors) {
    for (let node = this; node; node = node.parentElement) {
      if (selectors.split(',').some(selector => node.matches(selector.trim()))) return node;
    }
    return null;
  }
}

function fixture(options = {}) {
  let now = initialTime;
  const pageUrl = new URL(options.url || 'https://www.authentia.ca/resources/ai-strategy-working-pack.html?email=private%40example.com#client-note');
  const storage = new Map();
  if (options.preference !== undefined) storage.set('analyticsConsent', typeof options.preference === 'string' ? options.preference : JSON.stringify(options.preference));
  const writes = [];
  const cookieWrites = [];
  const cookies = new Map(Object.entries(options.cookies || {}));
  const documentListeners = new Map();
  const windowListeners = new Map();
  const timers = new Map();
  let timerId = 0;
  let reloads = 0;
  const document = {
    readyState: options.loading ? 'loading' : 'complete',
    currentScript: { dataset: { measurementId: options.id ?? measurementId, productionHosts: options.hosts ?? 'authentia.ca,www.authentia.ca' } },
    referrer: options.referrer ?? 'https://search.example.com/private/person?email=hidden%40example.com#note',
    createElement(tag) { return new Element(tag, document); },
    addEventListener(name, listener) {
      if (!documentListeners.has(name)) documentListeners.set(name, []);
      documentListeners.get(name).push(listener);
    }
  };
  document.head = new Element('head', document);
  document.body = new Element('body', document);
  document.head.isConnected = document.body.isConnected = true;
  Object.defineProperty(document, 'cookie', {
    get() { return [...cookies].map(([name, value]) => `${name}=${value}`).join('; '); },
    set(value) {
      cookieWrites.push(value);
      const [pair] = value.split(';');
      const [name, data] = pair.split('=');
      if (value.includes('Max-Age=0')) cookies.delete(name);
      else cookies.set(name, data);
    }
  });
  const location = {
    href: pageUrl.href, origin: pageUrl.origin, protocol: pageUrl.protocol,
    hostname: pageUrl.hostname, port: pageUrl.port, pathname: pageUrl.pathname,
    search: pageUrl.search, hash: pageUrl.hash,
    reload() { reloads++; }
  };
  const window = {
    location,
    localStorage: {
      getItem(key) { if (options.storageFails) throw new Error('storage unavailable'); return storage.get(key) ?? null; },
      setItem(key, value) { if (options.storageFails) throw new Error('storage unavailable'); storage.set(key, value); writes.push([key, value]); }
    },
    addEventListener(name, listener) {
      if (!windowListeners.has(name)) windowListeners.set(name, []);
      windowListeners.get(name).push(listener);
    },
    setTimeout(callback, milliseconds) { timers.set(++timerId, { callback, milliseconds }); return timerId; },
    clearTimeout(id) { timers.delete(id); }
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  vm.runInNewContext(source, { window, document, URL, Date: Clock, console }, { filename: 'analytics.js' });
  function walk(node, result = []) {
    result.push(node);
    for (const child of node.children) walk(child, result);
    return result;
  }
  function dispatchClick(target) {
    const event = { target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const listener of target.listeners.get('click') || []) listener(event);
    for (const listener of documentListeners.get('click') || []) listener(event);
    return event;
  }
  function choose(state) {
    const button = walk(document.body).find(node => node.dataset.analyticsChoice === state);
    assert.ok(button, `choice ${state} should be available`);
    dispatchClick(button);
  }
  function link(href, attributes = {}) {
    const node = document.createElement('a');
    node.href = new URL(href, location.href).href;
    node.textContent = attributes.text || 'Private arbitrary text private@example.com';
    Object.assign(node.dataset, attributes.dataset || {});
    (attributes.parent || document.body).appendChild(node);
    return node;
  }
  function preferences() {
    const button = document.createElement('button');
    button.dataset.analyticsPreferences = '';
    document.body.appendChild(button);
    dispatchClick(button);
    return button;
  }
  return {
    document, window, storage, writes, cookies, cookieWrites, timers,
    choose, link, click: dispatchClick, preferences,
    scripts: () => document.head.children.filter(node => node.tagName === 'SCRIPT'),
    queue: () => (window.dataLayer || []).map(entry => [...entry]),
    events: name => (window.dataLayer || []).map(entry => [...entry]).filter(entry => entry[0] === 'event' && (!name || entry[1] === name)),
    banners: () => document.body.children.filter(node => node.className === 'analytics-consent'),
    allNodes: () => walk(document.body),
    reloads: () => reloads,
    fireReady: () => { for (const listener of documentListeners.get('DOMContentLoaded') || []) listener(); },
    advance: milliseconds => { now += milliseconds; },
    fireTimers: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(timer => timer.callback()); },
    storageEvent: event => { for (const listener of windowListeners.get('storage') || []) listener(event); }
  };
}

function saved(state, extra = {}) { return { state, version: 1, expiresAt: initialTime + lifetime, ...extra }; }
let scenarios = 0;
function check(name, test) {
  test();
  scenarios++;
  console.log(`PASS ${name}`);
}

check('no Google loader, queue or cookie before explicit consent', () => {
  const site = fixture();
  assert.equal(site.scripts().length, 0);
  assert.equal(site.window.dataLayer, undefined);
  assert.equal(site.cookieWrites.length, 0);
  assert.equal(site.banners().length, 1);
  site.click(site.link('/downloads/free/ai-opportunity-scorecard.zip'));
  site.click(site.link('mailto:info@authentia.ca?subject=private%40example.com'));
  assert.equal(site.events().length, 0);
  assert.equal(site.window.dataLayer, undefined);
});

check('rejection persists and performs no Google work', () => {
  const site = fixture();
  site.choose('denied');
  const preference = JSON.parse(site.storage.get('analyticsConsent'));
  assert.equal(preference.state, 'denied');
  assert.equal(preference.version, 1);
  assert.equal(preference.expiresAt, initialTime + lifetime);
  assert.equal(site.scripts().length, 0);
  assert.equal(site.window.dataLayer, undefined);
  assert.equal(site.banners().length, 0);
  assert.equal(site.reloads(), 0);
});

check('grant starts once, sends one sanitized page view and never replays clicks', () => {
  const site = fixture();
  site.click(site.link('/downloads/free/ai-opportunity-scorecard.zip'));
  site.choose('granted');
  assert.equal(site.scripts().length, 1);
  assert.equal(site.scripts()[0].src, `https://www.googletagmanager.com/gtag/js?id=${measurementId}`);
  assert.equal(site.events().length, 1);
  assert.equal(site.events('file_download').length, 0);
  const calls = site.queue();
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }]);
  assert.equal(calls[1][2].analytics_storage, 'granted');
  assert.equal(calls[1][2].ad_storage, 'denied');
  const config = calls.find(call => call[0] === 'config')[2];
  assert.equal(config.send_page_view, false);
  assert.equal(config.cookie_expires, lifetime / 1000);
  assert.equal(config.cookie_update, false);
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
  const page = site.events('page_view')[0][2];
  assert.equal(page.page_location, 'https://www.authentia.ca/resources/ai-strategy-working-pack');
  assert.equal(page.page_referrer, 'https://search.example.com/');
  assert.equal(page.content_type, 'resource');
  const opener = site.preferences();
  site.choose('granted');
  assert.equal(site.scripts().length, 1);
  assert.equal(site.events('page_view').length, 1);
  assert.equal(site.document.activeElement, opener);
});

check('withdrawal disables collection, clears only GA cookies and reloads', () => {
  const site = fixture({ preference: saved('granted'), cookies: { _ga: 'client', _ga_TEST12345: 'session', unrelated: 'keep', _gads: 'keep-too' } });
  const priorEvents = site.events().length;
  site.preferences();
  site.choose('denied');
  assert.equal(site.window[`ga-disable-${measurementId}`], true);
  assert.equal(site.reloads(), 1);
  assert.equal(JSON.parse(site.storage.get('analyticsConsent')).state, 'denied');
  assert.equal(site.cookies.has('_ga'), false);
  assert.equal(site.cookies.has('_ga_TEST12345'), false);
  assert.equal(site.cookies.get('unrelated'), 'keep');
  assert.equal(site.cookies.get('_gads'), 'keep-too');
  assert.ok(site.cookieWrites.some(value => value.includes('domain=.authentia.ca')));
  assert.ok(site.cookieWrites.every(value => !value.includes('domain=.ca')));
  site.click(site.link('mailto:info@authentia.ca'));
  assert.equal(site.events().length, priorEvents);
  assert.equal(site.timers.size, 0);
});

check('expired, malformed, wrong-version and invalid preferences do not load GA', () => {
  const invalid = ['not JSON', 'null', saved('granted', { expiresAt: initialTime }), saved('granted', { version: 2 }), saved('yes'), saved('granted', { expiresAt: initialTime + lifetime + 1 }), saved('granted', { expiresAt: String(initialTime + lifetime) })];
  for (const preference of invalid) {
    const site = fixture({ preference });
    assert.equal(site.scripts().length, 0);
    assert.equal(site.window.dataLayer, undefined);
    assert.equal(site.banners().length, 1);
  }
});

check('valid returning preferences are honored without another banner', () => {
  const accepted = fixture({ preference: saved('granted') });
  assert.equal(accepted.scripts().length, 1);
  assert.equal(accepted.events('page_view').length, 1);
  assert.equal(accepted.banners().length, 0);
  const denied = fixture({ preference: saved('denied') });
  assert.equal(denied.scripts().length, 0);
  assert.equal(denied.banners().length, 0);
});

check('local, staging, lookalike and unconfigured hosts never load production measurement', () => {
  for (const url of ['http://localhost:8000/', 'https://localhost/', 'https://staging.authentia.ca/', 'https://authentia.ca.evil.example/', 'http://www.authentia.ca/', 'https://www.authentia.ca:8443/']) {
    const site = fixture({ url, preference: saved('granted'), hosts: 'localhost,staging.authentia.ca,authentia.ca.evil.example,authentia.ca,www.authentia.ca' });
    assert.equal(site.scripts().length, 0);
    assert.equal(site.banners().length, 0);
    site.preferences();
    assert.ok(site.allNodes().some(node => node.textContent.includes('Google Analytics is disabled in this preview')));
    assert.equal(site.allNodes().some(node => node.dataset.analyticsChoice), false);
    assert.equal(site.writes.length, 0);
  }
  assert.equal(fixture({ hosts: '', preference: saved('granted') }).scripts().length, 0);
  assert.equal(fixture({ id: '', preference: saved('granted') }).scripts().length, 0);
  assert.equal(fixture({ url: 'https://authentia.ca/', preference: saved('granted') }).scripts().length, 1);
});

check('only approved interactions produce fixed safe event payloads', () => {
  const site = fixture({ preference: saved('granted') });
  for (const slug of ['ai-opportunity-scorecard', 'workflow-brief-template', 'pilot-readiness-checklist']) {
    site.click(site.link(`/downloads/free/${slug}.zip?email=hidden%40example.com#private`));
  }
  assert.equal(site.events('file_download').length, 3);
  site.click(site.link('/downloads/free/private-client.zip'));
  site.click(site.link('https://other.example/downloads/free/ai-opportunity-scorecard.zip'));
  assert.equal(site.events('file_download').length, 3);
  for (const slug of ['ai-strategy-working-pack', 'ai-pilot-decision-pack']) {
    site.click(site.link(`/downloads/samples/${slug}-sample.html?person=private`));
    site.click(site.link(`/downloads/samples/${slug}-sample?person=private`));
  }
  assert.equal(site.events('resource_sample_click').length, 4);
  site.click(site.link('/downloads/samples/unapproved-sample'));
  site.click(site.link('/downloads/samples/ai-strategy-working-pack-sample.txt'));
  assert.equal(site.events('resource_sample_click').length, 4);
  site.click(site.link('mailto:privacy@authentia.ca'));
  assert.equal(site.events('contact_email_click').length, 0);
  site.click(site.link('mailto:info@authentia.ca?subject=Someone%20private%40example.com&body=confidential'));
  assert.equal(site.events('contact_email_click').length, 1);
  site.click(site.link('mailto:info@authentia.ca?subject=Resource%20enquiry%3A%20AI%20Strategy%20Working%20Pack&body=confidential'));
  site.click(site.link('mailto:info@authentia.ca?subject=ai-pilot-decision-pack'));
  assert.equal(site.events('paid_pack_interest').length, 2);
  assert.equal(site.events('contact_email_click').length, 1);
  const checkout = 'https://authentia.lemonsqueezy.com/buy/12345678-1234-1234-1234-123456789abc?checkout[email]=secret%40example.com';
  site.click(site.link(checkout, { dataset: { resourceId: 'ai-strategy-working-pack' } }));
  assert.equal(site.events('checkout_click').length, 1);
  site.click(site.link(checkout, { dataset: { resourceId: 'unknown' } }));
  site.click(site.link(checkout.replace('lemonsqueezy.com', 'lemonsqueezy.com.evil.example'), { dataset: { resourceId: 'ai-strategy-working-pack' } }));
  assert.equal(site.events('checkout_click').length, 1);
  const payload = JSON.stringify(site.queue());
  for (const forbidden of ['private@example.com', 'hidden', 'confidential', 'checkout[email]', 'private-client', 'mailto:', 'lemonsqueezy', '#client-note', '?email=']) assert.equal(payload.includes(forbidden), false, forbidden);
  assert.equal(site.events('generate_lead').length, 0);
  assert.equal(site.events('purchase').length, 0);
});

check('every catalogued resource reports only its recognised download, sample or enquiry', () => {
  const resources = JSON.parse(fs.readFileSync(new URL('../content/resources.json', import.meta.url), 'utf8'));
  for (const resource of resources) {
    const site = fixture({ url: `https://www.authentia.ca/resources/${resource.slug}`, preference: saved('granted') });
    assert.equal(site.events('page_view')[0][2].content_type, 'resource', resource.slug);
    if (resource.kind === 'Free') {
      site.click(site.link(`/downloads/free/${resource.slug}.zip?private=hidden`));
      assert.equal(site.events('file_download').length, 1, resource.slug);
      assert.equal(site.events('file_download')[0][2].resource_id, resource.slug);
    } else {
      site.click(site.link(`/downloads/samples/${resource.slug}-sample`));
      site.click(site.link(`mailto:info@authentia.ca?subject=${encodeURIComponent('Resource enquiry: '+resource.title)}&body=confidential`));
      assert.equal(site.events('resource_sample_click').length, 1, resource.slug);
      assert.equal(site.events('resource_sample_click')[0][2].resource_id, resource.slug);
      assert.equal(site.events('paid_pack_interest').length, 1, resource.slug);
      assert.equal(site.events('paid_pack_interest')[0][2].resource_id, resource.slug);
    }
    assert.equal(JSON.stringify(site.queue()).includes('confidential'), false);
  }
});

check('unknown paths and referrers cannot leak personal path components', () => {
  const site = fixture({ url: 'https://www.authentia.ca/private@example.com?name=Private', referrer: 'https://www.authentia.ca/private@example.com?secret=1', preference: saved('granted') });
  const page = site.events('page_view')[0][2];
  assert.equal(page.page_location, 'https://www.authentia.ca/404');
  assert.equal(page.page_referrer, 'https://www.authentia.ca/');
  assert.equal(page.content_type, 'not_found');
  const alias = fixture({ url: 'https://www.authentia.ca/contact/index.html?email=private', preference: saved('granted') });
  assert.equal(alias.events('page_view')[0][2].page_location, 'https://www.authentia.ca/contact');
});

check('clean production URLs and HTML aliases report the same canonical path', () => {
  for (const [canonical, aliases] of [
    ['/', ['/', '/index.html']],
    ['/contact', ['/contact', '/contact.html', '/contact/', '/contact/index.html']],
    ['/services/ai-strategy', ['/services/ai-strategy', '/services/ai-strategy.html']],
    ['/resources/ai-pilot-decision-pack', ['/resources/ai-pilot-decision-pack', '/resources/ai-pilot-decision-pack.html']]
  ]) {
    for (const alias of aliases) {
      const site = fixture({ url: `https://www.authentia.ca${alias}?email=secret%40example.com#private`, referrer: 'https://www.authentia.ca/about.html?person=private', preference: saved('granted') });
      assert.equal(site.events('page_view').length, 1);
      const payload = site.events('page_view')[0][2];
      assert.equal(payload.page_location, `https://www.authentia.ca${canonical}`);
      assert.equal(payload.page_referrer, 'https://www.authentia.ca/about');
      assert.equal(JSON.stringify(payload).includes('secret'), false);
    }
  }
});

check('every indexable sitemap page has a recognised, canonical analytics context', () => {
  const sitemap = fs.readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.ok(urls.length > 0);
  for (const url of urls) {
    const site = fixture({ url, preference: saved('granted') });
    assert.equal(site.events('page_view').length, 1, url);
    const payload = site.events('page_view')[0][2];
    assert.equal(payload.page_location, url);
    assert.notEqual(payload.content_type, 'not_found', url);
  }
});

check('storage failures preserve this-document choices without prompting repeatedly', () => {
  const site = fixture({ storageFails: true });
  site.choose('granted');
  assert.equal(site.scripts().length, 1);
  assert.equal(site.banners().length, 0);
  site.click(site.link('mailto:info@authentia.ca'));
  assert.equal(site.events('contact_email_click').length, 1);
  assert.equal(site.banners().length, 0);
  site.preferences();
  site.choose('denied');
  assert.equal(site.window[`ga-disable-${measurementId}`], true);
  assert.equal(site.reloads(), 1);
});

check('a long-lived tab expires consent and a different-tab withdrawal stops collection', () => {
  const site = fixture({ preference: saved('granted', { expiresAt: initialTime + 5000 }) });
  site.advance(5001);
  site.fireTimers();
  assert.equal(site.window[`ga-disable-${measurementId}`], true);
  assert.equal(site.reloads(), 1);
  const otherTab = fixture({ preference: saved('granted') });
  otherTab.storageEvent({ key: 'analyticsConsent', newValue: JSON.stringify(saved('denied')) });
  assert.equal(otherTab.window[`ga-disable-${measurementId}`], true);
  assert.equal(otherTab.reloads(), 1);
});

check('banner is an accessible region and does not intercept normal link navigation', () => {
  const site = fixture();
  const banner = site.banners()[0];
  assert.equal(banner.attributes.get('role'), 'region');
  assert.equal(banner.attributes.get('aria-label'), 'Analytics preferences');
  assert.ok(site.allNodes().some(node => node.href === '/privacy'));
  const buttons = site.allNodes().filter(node => node.dataset.analyticsChoice);
  assert.equal(buttons[0].className, buttons[1].className);
  assert.equal(buttons.every(button => button.type === 'button'), true);
  const event = site.click(site.link('/about.html'));
  assert.equal(event.defaultPrevented, false);
  const loading = fixture({ loading: true });
  assert.equal(loading.banners().length, 0);
  loading.fireReady();
  assert.equal(loading.banners().length, 1);
});

check('blocked third-party scripts leave site navigation working', () => {
  const site = fixture({ preference: saved('granted') });
  for (const listener of site.scripts()[0].listeners.get('error') || []) listener();
  assert.equal(site.window[`ga-disable-${measurementId}`], true);
  const before = site.events().length;
  const event = site.click(site.link('mailto:info@authentia.ca'));
  assert.equal(event.defaultPrevented, false);
  assert.equal(site.events().length, before);
});

console.log(`Verified ${scenarios} analytics scenarios in a network-free VM.`);
