/* Authentia analytics: basic consent, fixed event vocabulary, production hosts only. */
(() => {
  'use strict';

  const script = document.currentScript;
  const measurementId = script?.dataset.measurementId || '';
  const canonicalHosts = new Set(['authentia.ca', 'www.authentia.ca']);
  const configuredHosts = new Set((script?.dataset.productionHosts || '')
    .split(',').map(host => host.trim().toLowerCase()).filter(Boolean));
  const location = window.location;
  const production = location.protocol === 'https:' &&
    (!location.port || location.port === '443') &&
    canonicalHosts.has(location.hostname) && configuredHosts.has(location.hostname);
  const configured = /^G-[A-Z0-9]+$/.test(measurementId);
  const consentKey = 'analyticsConsent';
  const consentVersion = 1;
  const lifetime = 90 * 24 * 60 * 60 * 1000;
  const freeResources = new Set([
    'ai-opportunity-scorecard', 'workflow-brief-template', 'pilot-readiness-checklist'
  ]);
  const paidResources = new Set(['ai-strategy-working-pack', 'ai-pilot-decision-pack']);
  const packSubjects = new Map([
    ['Resource enquiry: AI Strategy Working Pack', 'ai-strategy-working-pack'],
    ['Resource enquiry: AI Pilot Decision Pack', 'ai-pilot-decision-pack'],
    ['ai-strategy-working-pack', 'ai-strategy-working-pack'],
    ['ai-pilot-decision-pack', 'ai-pilot-decision-pack']
  ]);
  const pages = new Map([
    ['/', ['Home', 'home']],
    ['/services.html', ['Services', 'service_index']],
    ['/services/ai-strategy.html', ['AI strategy', 'service']],
    ['/services/ai-digital-change-management.html', ['AI and digital change management', 'service']],
    ['/services/workflow-operating-model.html', ['Workflow and operating model design', 'service']],
    ['/services/ai-governance.html', ['Practical AI governance', 'service']],
    ['/services/implementation-advisory.html', ['Implementation advisory', 'service']],
    ['/services/ongoing-advisory.html', ['Ongoing advisory', 'service']],
    ['/approach.html', ['Our approach', 'approach']],
    ['/about.html', ['About Authentia', 'about']],
    ['/contact.html', ['Contact Authentia', 'contact']],
    ['/case-studies.html', ['Case studies', 'case_study_index']],
    ['/case-studies/dental-technology-ai-pilot.html', ['Dental technology AI pilot', 'case_study']],
    ['/case-studies/cross-border-marketplace.html', ['Cross-border marketplace', 'case_study']],
    ['/case-studies/financial-services-digital-experience.html', ['Financial services digital experience', 'case_study']],
    ['/insights.html', ['Insights', 'insight_index']],
    ['/insights/choosing-your-first-ai-use-case.html', ['Choosing your first AI use case', 'insight']],
    ['/insights/buy-adapt-or-build-ai.html', ['Buy, adapt or build AI', 'insight']],
    ['/insights/from-prompts-to-reliable-workflows.html', ['From prompts to reliable workflows', 'insight']],
    ['/insights/evaluating-an-ai-pilot-before-rollout.html', ['Evaluating an AI pilot before rollout', 'insight']],
    ['/insights/ai-adoption-beyond-training.html', ['AI adoption beyond training', 'insight']],
    ['/insights/measuring-ai-value-beyond-usage.html', ['Measuring AI value beyond usage', 'insight']],
    ['/resources.html', ['Resources', 'resource_index']],
    ['/resources/ai-opportunity-scorecard.html', ['AI Opportunity Scorecard', 'resource']],
    ['/resources/workflow-brief-template.html', ['Workflow Brief Template', 'resource']],
    ['/resources/pilot-readiness-checklist.html', ['Pilot Readiness Checklist', 'resource']],
    ['/resources/ai-strategy-working-pack.html', ['AI Strategy Working Pack', 'resource']],
    ['/resources/ai-pilot-decision-pack.html', ['AI Pilot Decision Pack', 'resource']],
    ['/privacy.html', ['Privacy policy', 'legal']],
    ['/terms.html', ['Terms of service', 'legal']],
    ['/404.html', ['Page not found', 'not_found']]
  ]);

  let granted = false;
  let expiresAt = 0;
  let tagStarted = false;
  let pageViewSent = false;
  let banner = null;
  let opener = null;
  let expiryTimer = null;

  function knownPath(pathname) {
    if (pathname === '/index.html') return '/';
    if (pages.has(pathname)) return pathname;
    const withoutIndex = pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
    if (!withoutIndex) return '/';
    const htmlPath = `${withoutIndex}.html`;
    return pages.has(htmlPath) ? htmlPath : null;
  }

  function canonicalPath(pathname) {
    return pathname.replace(/\.html$/, '');
  }

  const pagePath = knownPath(location.pathname) || '/404.html';
  const [pageTitle, contentType] = pages.get(pagePath);
  let referrer = '';
  try {
    const source = new URL(document.referrer);
    if (source.protocol === 'https:' || source.protocol === 'http:') {
      // External referrer paths can also contain private data. Keep only their origin.
      const sourcePath = canonicalHosts.has(source.hostname) ? knownPath(source.pathname) : null;
      referrer = source.origin + (sourcePath ? canonicalPath(sourcePath) : '/');
    }
  } catch { /* An absent or invalid referrer remains empty. */ }

  function context() {
    return {
      page_location: location.origin + canonicalPath(pagePath),
      page_referrer: referrer,
      page_title: pageTitle,
      content_type: contentType
    };
  }

  function validPreference(value) {
    if (!value || value.version !== consentVersion ||
      !['granted', 'denied'].includes(value.state) ||
      !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= Date.now() ||
      value.expiresAt > Date.now() + lifetime) return null;
    return value;
  }

  function readPreference() {
    try { return validPreference(JSON.parse(window.localStorage.getItem(consentKey))); }
    catch { return null; }
  }

  function savePreference(state) {
    const preference = { state, version: consentVersion, expiresAt: Date.now() + lifetime };
    try { window.localStorage.setItem(consentKey, JSON.stringify(preference)); }
    catch { /* A choice still applies to this document when storage is unavailable. */ }
    return preference;
  }

  function queue() {
    window.dataLayer.push(arguments);
  }

  function clearAnalyticsCookies() {
    const names = document.cookie.split(';').map(cookie => cookie.split('=')[0].trim())
      .filter(name => /^_ga(?:_[A-Za-z0-9_]+)?$/.test(name));
    const domains = [null, location.hostname, `.${location.hostname}`, 'authentia.ca', '.authentia.ca'];
    for (const name of new Set(names)) {
      for (const domain of new Set(domains)) {
        document.cookie = `${name}=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax; Secure${domain ? `; domain=${domain}` : ''}`;
      }
    }
  }

  function stopCollection() {
    granted = false;
    expiresAt = 0;
    if (expiryTimer !== null) window.clearTimeout(expiryTimer);
    if (!tagStarted) return;
    window[`ga-disable-${measurementId}`] = true;
    queue('consent', 'update', {
      analytics_storage: 'denied', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    });
    clearAnalyticsCookies();
    // A fresh document keeps the third-party tag unloaded after withdrawal.
    try { location.reload(); } catch { /* The disable flag remains in force. */ }
  }

  function scheduleExpiry() {
    if (expiryTimer !== null) window.clearTimeout(expiryTimer);
    if (!granted) return;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) { stopCollection(); return; }
    // Browser timers have a signed 32-bit limit; recheck long-lived tabs in chunks.
    expiryTimer = window.setTimeout(scheduleExpiry, Math.min(remaining, 24 * 60 * 60 * 1000));
  }

  function startCollection(preference) {
    if (!production || !configured) return;
    granted = true;
    expiresAt = preference.expiresAt;
    scheduleExpiry();
    if (tagStarted) return;
    tagStarted = true;
    window[`ga-disable-${measurementId}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = queue;
    queue('consent', 'default', {
      analytics_storage: 'denied', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    });
    queue('consent', 'update', {
      analytics_storage: 'granted', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    });
    queue('js', new Date());
    queue('config', measurementId, {
      send_page_view: false,
      cookie_expires: lifetime / 1000,
      cookie_update: false,
      cookie_path: '/',
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      ...context()
    });
    if (!pageViewSent) {
      pageViewSent = true;
      queue('event', 'page_view', context());
    }
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    tag.addEventListener('error', () => {
      window[`ga-disable-${measurementId}`] = true;
    });
    document.head.appendChild(tag);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function closePreferences() {
    if (banner) banner.remove();
    banner = null;
    if (opener?.isConnected) opener.focus();
    opener = null;
  }

  function choose(state) {
    const preference = savePreference(state);
    closePreferences();
    if (state === 'granted') startCollection(preference);
    else stopCollection();
  }

  function showPreferences(button = null) {
    if (banner) banner.remove();
    opener = button;
    banner = element('aside', 'analytics-consent');
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Analytics preferences');
    banner.appendChild(element('h2', 'analytics-consent__title', 'Analytics preferences'));
    const available = production && configured;
    banner.appendChild(element('p', 'analytics-consent__text', available
      ? (granted
        ? 'Google Analytics is currently on to help us understand visits and resource interest. Reject analytics to turn it off. You can revisit this choice using Analytics preferences in the footer.'
        : 'Google Analytics is currently off. With your permission, it helps us understand visits and resource interest. You can change your choice using Analytics preferences in the footer.')
      : 'Google Analytics is disabled in this preview. Choices here do not change the live website’s settings.'));
    const actions = element('div', 'analytics-consent__actions');
    let accept;
    if (available) {
      accept = element('button', 'analytics-consent__button', 'Accept analytics');
      accept.type = 'button';
      accept.dataset.analyticsChoice = 'granted';
      accept.addEventListener('click', () => choose('granted'));
      const reject = element('button', 'analytics-consent__button', 'Reject analytics');
      reject.type = 'button';
      reject.dataset.analyticsChoice = 'denied';
      reject.addEventListener('click', () => choose('denied'));
      actions.appendChild(accept);
      actions.appendChild(reject);
    }
    if (button || !available) {
      const close = element('button', 'analytics-consent__button', 'Close');
      close.type = 'button';
      close.dataset.analyticsClose = '';
      close.addEventListener('click', closePreferences);
      actions.appendChild(close);
    }
    banner.appendChild(actions);
    const policy = element('a', 'analytics-consent__policy', 'Privacy policy');
    policy.href = '/privacy';
    banner.appendChild(policy);
    document.body.appendChild(banner);
    if (button) (accept || actions.children[0])?.focus();
  }

  function placement(link) {
    const declared = link.dataset.analyticsPlacement;
    if (['hero', 'navigation', 'body', 'footer', 'resource_card'].includes(declared)) return declared;
    if (link.closest('footer, .site-footer')) return 'footer';
    if (link.closest('header, nav')) return 'navigation';
    return 'body';
  }

  function sendEvent(name, parameters) {
    if (!granted || !tagStarted || window[`ga-disable-${measurementId}`]) return;
    if (expiresAt <= Date.now()) { stopCollection(); return; }
    queue('event', name, { ...context(), ...parameters });
  }

  function measureLink(link) {
    // Returning here prevents pre-consent interaction queuing or later replay.
    if (!granted) return;
    let url;
    try { url = new URL(link.href, location.href); } catch { return; }
    const eventPlacement = placement(link);
    if (url.protocol === 'mailto:') {
      let recipient;
      try { recipient = decodeURIComponent(url.pathname).toLowerCase(); } catch { return; }
      if (recipient !== 'info@authentia.ca') return;
      const resourceId = packSubjects.get(url.searchParams.get('subject'));
      if (resourceId) sendEvent('paid_pack_interest', { resource_id: resourceId, placement: eventPlacement });
      else sendEvent('contact_email_click', { contact_method: 'email', placement: eventPlacement });
      return;
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return;
    if (canonicalHosts.has(url.hostname)) {
      const free = /^\/downloads\/free\/([a-z-]+)\.zip$/.exec(url.pathname)?.[1];
      if (freeResources.has(free)) {
        sendEvent('file_download', {
          resource_id: free, resource_kind: 'free', file_extension: 'zip',
          file_name: `${free}.zip`, placement: eventPlacement
        });
        return;
      }
      const sample = /^\/downloads\/samples\/([a-z-]+)-sample(?:\.html)?$/.exec(url.pathname)?.[1];
      if (paidResources.has(sample)) {
        sendEvent('resource_sample_click', { resource_id: sample, placement: eventPlacement });
      }
      return;
    }
    const resourceId = link.dataset.resourceId;
    if (paidResources.has(resourceId) && /^[a-z0-9-]+\.lemonsqueezy\.com$/.test(url.hostname) &&
      /^\/(?:checkout\/)?buy\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/?$/i.test(url.pathname)) {
      sendEvent('checkout_click', { resource_id: resourceId, placement: eventPlacement });
    }
  }

  function initialize() {
    document.addEventListener('click', event => {
      const target = event.target?.closest ? event.target : event.target?.parentElement;
      const preferences = target?.closest('[data-analytics-preferences]');
      if (preferences) {
        event.preventDefault();
        showPreferences(preferences);
        return;
      }
      const link = target?.closest('a[href]');
      if (link && !event.defaultPrevented) measureLink(link);
    });
    if (!production || !configured) return;
    const preference = readPreference();
    if (preference?.state === 'granted') startCollection(preference);
    else if (!preference) showPreferences();
    window.addEventListener('storage', event => {
      if (event.key !== consentKey && event.key !== null) return;
      let updated;
      try { updated = validPreference(JSON.parse(event.newValue)); } catch { updated = null; }
      // Withdrawal or removal in another tab also stops this document.
      if (granted && updated?.state !== 'granted') stopCollection();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
