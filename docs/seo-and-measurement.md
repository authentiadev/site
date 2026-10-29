# Authentia search visibility and measurement plan

Status recorded on 28 October 2026, Toronto time. The approved site is published at [www.authentia.ca](https://www.authentia.ca/). Production deployment and live Google Analytics receipt have been verified. The site targets business buyers in Canada, the United States and the United Kingdom. The remaining unchecked items below are future reporting, inspection or optional integrations, rather than a claim that indexing or rankings are immediate.

## Production release and verification

The user approved publication of the reviewed preview. The approved content revision is `88172c1d3e65bc70677a98dc415c4400dc0395eb`; it was fast-forwarded to the production `main` branch. Cloudflare deployment `94efa1f5-68c6-4780-893d-332b309bd78f` reported **success**, with a 14-second build at 11:21 PM Toronto time on 28 October. The reviewed preview remains available at [73ee6904.site-bvz.pages.dev](https://73ee6904.site-bvz.pages.dev/) and is marked `X-Robots-Tag: noindex` by the host.

Verified on the public domain after deployment:

- The homepage returns HTTP 200 with the new AI consulting title, one local consent loader and no directly embedded Google tag. The canonical origin is `https://www.authentia.ca`; production has no preview `noindex` header.
- The bare-domain 301 preserves paths and queries. Older trailing-slash aliases resolve without loops. Representative service, article and case-study pages return 200; an unknown URL returns a real 404.
- `content/site.json`, `scripts/build-site.mjs` and `docs/seo-and-measurement.md` return 404 publicly. Complete paid packs remain outside the repository and deployment. The hosted free scorecard ZIP matched the validated local ZIP byte-for-byte and passed CRC validation.
- The live robots file permits public crawling and points to the live sitemap. The sitemap contains 25 clean canonical URLs. Search Console accepted the resubmission, then reported **Success** and **25 discovered pages**, with a new last-read date of 28 October. This resolves the historical sitemap error; discovered pages are not proof that all 25 are indexed.
- Live rejection persisted after reload with **zero Google measurement requests**. An authorised opt-in test loaded the real Google tag (HTTP 200) and a collection request for `G-LP7BRQP3MV` returned HTTP 204. Realtime in property `411575580` subsequently showed Home page views and session/engagement events. These include launch test activity and are not business performance results.
- After the test, Analytics permission was rejected again, the document reloaded with zero Google measurement requests, and the browser blocker's original **optimal** filtering mode was restored. The temporary exception was limited to `www.authentia.ca` and approved by the user.

The browser blocker initially substituted a dummy Analytics script. Its filtering-mode change can automatically reload a page, and a manual reload was also used during verification. Realtime aggregate counts therefore cannot be interpreted as the number of deliberate test actions or proof of duplicate tagging. Source review still shows one guarded manual page view per document, one loader, and `send_page_view:false`; no speculative tracking change was made. [Google manual page-view guidance](https://developers.google.com/analytics/devguides/collection/ga4/views), [uBlock filtering-mode reload implementation](https://raw.githubusercontent.com/gorhill/uBlock/master/platform/mv3/extension/js/popup.js)

## Verified Analytics account and current settings

The intended existing Google Analytics destination was confirmed in the native account interface during this session:

| Item | Confirmed value |
| --- | --- |
| Analytics account | `289404317` |
| GA4 property | `411575580` |
| Web stream | `9983632663` |
| Measurement ID | `G-LP7BRQP3MV` |
| Stream website | `https://www.authentia.ca` |
| Enhanced measurement | OFF; saved during this session |
| Email data redaction | ON |
| Google Signals | OFF |
| User-provided data collection | OFF |
| Event data retention | 2 months; unchanged |
| User data retention | 14 months; unchanged |
| Reset user data on new activity | ON; unchanged |
| Event-scoped custom dimensions | Resource (`resource_id`), Content type (`content_type`), CTA placement (`placement`); created and verified in the account |
| Incoming data | Live collection endpoint and Realtime receipt verified after deployment; includes launch testing |

The retention settings above are observations, not recommendations that have been applied. Any later retention change should be a recorded business decision. Cookie lifetime and Analytics server-side retention are different controls. Google explains that retention primarily affects user/event data used in explorations and funnel reports, while standard aggregated reports are treated differently. [Google Analytics retention documentation](https://support.google.com/analytics/answer/7667196)

## Verified hosting and existing Cloudflare measurement

The native Cloudflare Pages project interface was inspected during this session:

| Item | Observed value |
| --- | --- |
| Pages project | `site` |
| Connected Git repository | `authentiadev/site` |
| Production branch | `main` |
| Automatic production deployments | Enabled; unchanged |
| Approved production content revision | `88172c1`; previous production baseline was `ba95e7a` |
| Build command | `node scripts/build-site.mjs && node scripts/prepare-publish.mjs`; saved after validating the public package |
| Build output directory | `dist`; saved during this session |
| Root directory | Blank; unchanged |
| Metrics → Web Analytics | Enabled; unchanged |

The rewritten site was published after explicit approval. With automatic production deployment enabled, a later push to the connected production branch can trigger another production deployment. The build command and output directory were subsequently configured as shown above, to package public files separately from working documents and source. These scripts must be present in the commit being built. Rebuilding a historical commit that predates them would require its previous blank build command/output settings, or restoring a previous successful deployment directly.

A new single redirect named **Authentia apex to canonical www** was activated after observing that the bare domain returned HTTP 403. It matches only `(http.host eq "authentia.ca")`, forwards to `concat("https://www.authentia.ca", http.request.uri.path)` with HTTP 301, and preserves query strings. HTTPS checks confirmed `/` redirects to `https://www.authentia.ca/` and `/contact?source=verification` redirects to the same path/query on `www`. No existing web or mail DNS record was changed. [Cloudflare hostname redirect guidance](https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-all-different-hostname/)

Cloudflare Pages automatically serves matching HTML files at extensionless URLs and redirects HTML aliases to their clean counterparts, such as `/contact.html` to `/contact`. Public canonical URLs, internal links and sitemap entries therefore use the clean route while source files can remain `.html` on disk. The homepage is `/`. Confirm the actual redirect/status behavior on the live deployment before submitting the new sitemap. [Cloudflare Pages serving behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/)

Cloudflare's existing cookieless Web Analytics service is separate from the new GA4 implementation. Cloudflare documents that enabling Web Analytics on a Pages project automatically adds its JavaScript beacon on the next deployment. It describes the service as privacy-first real user monitoring using browser performance information. Preserve this distinction in the privacy notice and verify the actual injected beacon after deployment; no manual duplicate beacon was added. [Cloudflare Pages Web Analytics](https://developers.cloudflare.com/pages/how-to/web-analytics/), [Cloudflare Web Analytics overview](https://developers.cloudflare.com/web-analytics/about/)

The site's Google Analytics preferences control governs GA4, not this host-injected Cloudflare beacon. Do not describe rejection as disabling every measurement service or claim that the local GA4 hostname guard controls a hosted Cloudflare preview. The live hosting behavior needs its own check. Cloudflare's aggregate page/performance reporting also does not replace the manual CTA events or restore UTM reporting: its current documentation says query strings are not logged and custom events are not supported. [Cloudflare Web Analytics FAQs](https://developers.cloudflare.com/web-analytics/faq/)

## Prepared consent and collection behavior

`js/analytics.js` uses basic consent gating. It does not load the Google tag, create an Analytics event queue or request Analytics collection before a valid grant. It runs measurement only on HTTPS at the explicitly configured production hosts `authentia.ca` and `www.authentia.ca`. Localhost, staging hosts, lookalike domains, nonstandard ports and missing configuration do not collect production measurements. The local preview's preferences control explains that collection is disabled.

The local `analyticsConsent` preference contains a state, version and expiry. Choices expire after 90 days. Missing, malformed, expired or incompatible records do not grant collection. When browser storage is unavailable, a choice applies to the current document without repeated prompts during that document. Analytics cookies are configured for 90 days with rolling updates disabled. Advertising consent types remain denied; Google Signals and ad-personalization signals are disabled in the tag configuration.

Google's advanced consent mode can send cookieless measurements while consent is denied. That behavior is deliberately outside this implementation. Basic mode is the relevant choice for the requirement to send no Analytics data before opt-in. [Google consent-mode overview](https://developers.google.com/tag-platform/security/concepts/consent-mode)

Withdrawal disables the configured measurement ID, updates consent to denied, clears matching first-party `_ga` and `_ga_*` cookies at the known host/parent-domain scope, and reloads so the third-party tag remains unloaded. Other cookies are left alone. A storage event indicating denial, removal or an invalid preference in another same-origin tab also stops an already collecting document. A grant made in another tab does not start collection or replay earlier interactions in this document; the saved choice is read on its next navigation. Local storage is origin-scoped, so the apex and `www` hosts do not share that preference. Production redirects should consistently resolve visits to the chosen canonical host.

There is no claim that these controls alone establish compliance in every jurisdiction. Current ICO guidance has a narrow statistical-purpose exception with conditions and excludes individual visitor tracking from that exception. This plan uses explicit optional-analytics consent rather than assuming GA4 is exempt. Keep refusal as accessible as acceptance and retain the footer preferences control. [ICO exceptions](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/), [ICO consent guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-manage-consent-in-practice/)

## Event definitions and reporting limits

Enhanced measurement is off to prevent automatic collection from duplicating or broadening the explicit event plan. One manual page view is prepared per document after consent. Earlier clicks are not replayed when a visitor later accepts.

| Event | Recorded action | Interpretation |
| --- | --- | --- |
| `page_view` | A consented view of a known page | Content consumption among measured visitors |
| `contact_email_click` | An ordinary `info@authentia.ca` email link click | Email-composer intent; no evidence an email was sent or received |
| `file_download` | A click on one of the three allowlisted free ZIPs | Download initiation; no evidence of completed transfer, opening or use |
| `resource_sample_click` | A click on either allowlisted paid-pack sample | Sample interest |
| `paid_pack_interest` | A pack-specific email link with a recognized fixed subject | Product enquiry intent; no confirmed enquiry or sale |
| `checkout_click` | Future supported Lemon Squeezy link with an approved resource ID | Checkout-link intent only; no purchase inference |

A pack-specific email click uses `paid_pack_interest` rather than also emitting `contact_email_click`. Privacy-address clicks are not measured. Parameters are fixed resource IDs, a controlled placement value and sanitized page context. Raw link text, email subjects/bodies, addresses, checkout query parameters and user-entered information are not event parameters.

The implementation does not emit `generate_lead` or `purchase`. A future form or booking flow needs a reliable success signal before measuring a generated lead. Purchases require actual successful-payment evidence and deduplication, not a click or a return-page visit. Do not assign fabricated monetary values to these intent events. [Google recommended events](https://support.google.com/analytics/answer/9267735), [purchase deduplication](https://support.google.com/analytics/answer/12313109)

### Deliberate campaign-attribution limitation

Reported page locations use canonical clean paths and omit all query strings and fragments. For example, both `/services/ai-strategy` and its `.html` alias report `/services/ai-strategy`; the homepage reports `/`. External referrers retain the origin only; recognized first-party paths use the same clean-path convention without their queries. Static titles and known page paths avoid reporting arbitrary text from URLs. Unknown paths are represented as `/404` in measurement. Public paid-sample clicks recognize both the clean URL and its `.html` alias without broadening the resource allowlist; ZIP download paths keep their file extension.

This design does not preserve UTM campaign parameters. Do not expect reliable campaign/source/medium attribution from UTM-tagged links under the present implementation. Referring-domain information can still be available, but direct/unknown traffic may also include visits with unavailable referrers, including some AI referrals. These reports cannot identify every AI-originated visit.

If campaign reporting becomes necessary, define an approved campaign taxonomy and a narrowly validated parameter mapping as a separate change. Do not restore arbitrary query strings or transmit unrestricted campaign values. Email redaction is an additional best-effort safeguard, not proof that arbitrary values are safe to collect. [Google PII guidance](https://support.google.com/analytics/answer/6366371), [GA4 data redaction](https://support.google.com/analytics/answer/13544947)

When adding or renaming site pages, update the known-page inventory in `js/analytics.js` and its tests. Otherwise the new page can be grouped as `/404`. The internal map may use `.html` source keys, but the reported page location remains clean. Update fixed resource/subject mappings if the public catalogue or enquiry links change.

Consent refusals, blockers and script failures mean GA4 represents a measured subset of visits. Search Console impressions, consented Analytics visits, email intentions and actual enquiries have different definitions and should not be presented as one continuous verified conversion funnel.

## SEO and generative-search priorities

Use the existing visual design while making each page answer a business decision clearly. Authentia's strongest content should explain its advisory role, specific deliverables, relevant experience and the boundaries between advice, implementation and client/provider ownership. Keep the confirmed limited Canadian dental pilot separate from the planned wider US rollout. Do not turn positive feedback into fabricated quantitative results.

Google's current AI optimization guide emphasizes useful original expertise and established SEO fundamentals. It says Google Search does not use `llms.txt` as a ranking/visibility mechanism and requires no special AI schema. Prioritize crawlable pages, clear internal links, substantive text, accurate visible claims and structured data consistent with the page. Eligibility does not guarantee indexing or appearance. [Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), [AI feature eligibility](https://developers.google.com/search/docs/appearance/ai-features)

Do not add FAQ markup as an assumed visibility shortcut. Google removed FAQ rich-result support in May 2026 and later removed the feature documentation. A useful question-and-answer section can still serve readers when the content warrants it. [Google Search documentation updates](https://developers.google.com/search/updates)

### Current 2026 Search AI controls and reports

Google's dedicated Generative AI performance report for Search covers impressions in AI Overviews and AI Mode, grouped by pages, countries, dates and devices. Worldwide rollout was completed on 31 August 2026. The report may be absent when a site lacks enough impressions. Use it for visibility, without interpreting impressions as visits, enquiries or revenue. [Generative AI performance report](https://support.google.com/webmasters/answer/16984139)

Search Console also provides **Settings → Search generative AI**. Inclusion, exclusion and parent-setting inheritance affect participation in specified Search AI features. This is separate from AI-training controls, and exclusion is not a general exclusion from ordinary Search. For the verified Authentia domain property, **Include (Default)** was observed selected and Save was disabled; the setting was inspected and left unchanged. [Search generative AI control](https://support.google.com/webmasters/answer/16908024)

Bing's AI Performance reporting covers citations across supported Microsoft AI experiences. Citations and sampled grounding queries are visibility evidence, not rankings, confirmed traffic or leads. Inspect availability after site verification rather than assuming data will exist at launch. [Microsoft AI Performance announcement](https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/)

## Local performance and browser verification

A mobile Lighthouse 13.5.0 navigation audit of the packaged site at `http://127.0.0.1:8766/` used the default emulated Moto G Power, simulated Slow 4G and 4× CPU slowdown. The final saved report is `docs/reports/lighthouse-mobile.json`. Its results were Performance **85**, Accessibility **100**, Best Practices **100** and SEO **100**, with FCP **2.7 s**, LCP **3.3 s**, TBT **60 ms** and CLS **0.011**. The initial local audit before the measured media/contrast changes scored Performance 55, with LCP 16.6 s and TBT 590 ms. Runs can vary; these are local lab observations, not production field measurements or ranking/visibility guarantees. No production Core Web Vitals pass is claimed.

Changes preserve the existing visual composition and media assets: the existing hero poster is now native and preloaded at high priority, the main logo loads eagerly, and the two below-fold videos hydrate near the viewport while honoring pause/reduced-motion choices. A small darkening of the existing grey and footer opacity fix addressed measured contrast failures. The final network audit includes the hero video but no initial Zoom/lobby media requests. The original Webflow animation bundle remains; its production compression and real-user loading need a separate live check. [Video loading guidance](https://web.dev/articles/lazy-loading-video), [LCP optimization guidance](https://web.dev/articles/optimize-lcp)

## Search Console and Bing status

The correct `adrian@authentia.ca` Google account initially showed the Search Console welcome screen without sites. The domain property **`sc-domain:authentia.ca` is now verified**, with success confirmed in the Search Console interface. After the user signed into Cloudflare, one root TXT verification record was added manually and confirmed present. Existing web and mail records were left untouched. The manual route avoided granting Google persistent DNS-provider access. The public verification token is intentionally not duplicated here.

The existing `www` CNAME was observed pointing to `site-bvz.pages.dev`, confirming Cloudflare Pages as the current hosting destination; that record was not changed. Publication used the existing Pages project. Search Console ownership and the live clean routes are verified. The live sitemap was resubmitted successfully and then reported Success with 25 discovered pages. No individual indexing requests were made. Search and AI performance reporting still need sufficient traffic and processing time. The interface labels the property addition 29 October in UTC; this document uses the user's Toronto date of 28 October. Bing Webmaster Tools ownership, sitemap submission and account-specific reports remain unverified.

## Launch and future measurement checklist

- [x] Verify the Search Console domain property through one manually added root TXT record. Success confirmed for `sc-domain:authentia.ca`; original web/mail records retained.
- [x] Deploy only after the agreed review. Confirm live HTTPS, the canonical `www` redirect, representative page status codes, meaningful 404 responses, assets and consent controls. Record the actual launch date.
- [x] Before pushing to production `main`, confirm the intended deployment output against the observed automatic-deployment settings. Inspect the delivered HTML/network for the expected single Cloudflare beacon and keep its disclosure separate from GA4 consent. Check any hosted preview independently; do not add a duplicate manual beacon.
- [x] Confirm that robots directives and hosting controls permit intended public pages and assets to be crawled. Ensure private paid products remain outside the public deployment; robots rules are not access control.
- [x] Review live canonical URLs, titles/descriptions, social metadata, internal links and structured data. Use visible facts only and inspect representative service, case-study, article and resource pages.
- [x] Check that the sitemap contains intended canonical public URLs and accurate significant-modification dates. Submit it only after ownership verification and confirm successful processing. A submission is a discovery hint, not indexing confirmation. [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [ ] Use Search Console URL Inspection on the live homepage and representative new pages. Review selected canonicals, received HTML, indexing exclusions and later coverage; submit limited indexing requests where appropriate. Recheck after processing rather than reporting immediate ranking success.
- [x] Inspect the domain property's Search generative AI control. **Include (Default)** confirmed; no setting change made.
- [ ] Establish a baseline for ordinary Search and, when available, the dedicated AI impressions report, with Canada/US/UK views. Recheck effective inheritance if URL-prefix/child properties are introduced later.
- [ ] Verify Bing ownership, sitemap processing and representative URLs. Inspect Search and AI Performance separately and record any missing-data limitation.
- [x] Run `node scripts/check-analytics.mjs` after analytics changes. The network-free VM checks consent states, sanitized payloads, event mappings, nonproduction suppression, storage failure, expiry and cross-tab withdrawal. Passing these tests does not establish receipt by Google.
- [x] After deployment, verify a fresh visit/rejection produces no Analytics loader, collection requests or cookies. Verify acceptance loads one tag, sends one sanitized page view and the intended interactions, and that withdrawal/revisit stops collection. Check desktop/mobile and blocked-script behavior.
- [x] Confirm received events in the verified GA4 destination using an approved post-launch check. Verify payloads and duplication before treating reports as operational evidence. Keep local/staging production measurement disabled; do not bypass the host guard for rehearsals.
- [ ] Review developer/internal/hostname filters before changing them. Google's filter changes affect incoming data and can permanently exclude it; use Testing first where appropriate. Debug mode alone does not exclude events from reports. [Developer filters](https://support.google.com/analytics/answer/13296662), [hostname filters](https://support.google.com/analytics/answer/16608575)
- [ ] Review key-event designation against the intent definitions above. Keep actual received enquiries and sales in the appropriate business records until a verified integration exists.
- [ ] Before enabling external checkout analytics, verify consent behavior on that provider's pages and choose one event owner. Lemon Squeezy's native GA4 integration already sends ecommerce events including successful purchases; avoid duplicating them with browser return-page logic. Review cross-domain measurement and unwanted referrals only for the actual configured checkout. [Lemon Squeezy analytics](https://docs.lemonsqueezy.com/help/online-store/analytics), [Google cross-domain measurement](https://developers.google.com/tag-platform/devguides/cross-domain), [unwanted referrals](https://support.google.com/analytics/answer/10327750)
- [ ] Keep the privacy notice synchronized with the live implementation, actual cookie lifetimes, observed account retention and external providers. Do not describe all Analytics data as anonymous or claim that Google never receives IP addresses. Current Google documentation distinguishes regional handling. [UK/EU/Swiss handling](https://support.google.com/analytics/answer/12017362), [other-region handling](https://support.google.com/analytics/answer/16871531)
- [ ] At the first review with sufficient data, compare useful landing pages and intent events by content type and target country. Use the findings to improve substantive content, then record what changed. Avoid promising a ranking, AI citation, lead volume or return from an optimization alone.
