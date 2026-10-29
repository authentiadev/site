# Authentia website

Static website for Authentia's AI strategy and digital change advisory services. It retains the existing Webflow stylesheet, photography, video, logos, colour palette, and homepage composition.

## Build and check

Use Node.js to regenerate the HTML after editing source content:

```sh
node scripts/build-site.mjs
python3 scripts/check-site.py
node scripts/check-analytics.mjs
node scripts/check-motion.mjs
python3 scripts/check-preview.py
node scripts/prepare-publish.mjs
python3 scripts/check-site.py --root dist --config content/site.json
```

There are no package dependencies. Generated HTML is checked in. The publish script creates an isolated `dist/` folder containing public pages and assets; working content, scripts, documentation, hidden files and unapproved ZIP archives are excluded.

For local preview:

```sh
python3 scripts/preview-site.py --port 8766 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8766/ in a browser. This loopback-only server reproduces the site's Cloudflare Pages clean routes, redirects and custom 404. Rebuild and repackage after editing sources. Preview visits do not send Google Analytics events.

## Content sources

- `content/home.html` contains the homepage body, with the original composition and animation identifiers.
- `content/services.json`, `content/articles.json`, `content/cases.json`, and `content/resources.json` contain the service offering, long-form content and catalogue.
- `content/site.json` contains the canonical domain, enquiry email, checkout configuration, verified Analytics ID and manually maintained site review date.
- `scripts/build-site.mjs` contains the common layouts, company information, and website policies.
- `css/advisory.css` extends the existing stylesheet for navigation and new page types.
- `js/advisory.js` handles mobile navigation, resource filters, and background-video controls.
- `js/analytics.js` handles opt-in Google Analytics and a fixed list of safe interaction events.

The publish script derives service, case, article and resource pages from their content files. When adding a page, update the known-page inventory in `js/analytics.js`; the Analytics check compares that inventory with the sitemap. Add any new root page to the publish script's fixed inventory. Validate the packaged output as well as sources.

Articles and cases have an answer summary, organisation byline and manually maintained `modified` date. Update review dates only after a substantive review. A draft is not assigned a historical publication date. Keep case-study outcomes tied to available evidence.

Client names are withheld in the cases. The dental technology story distinguishes the live Canadian rollout from the planned US expansion. Historical digital product cases remain identified as earlier delivery experience. No numerical pilot results or new testimonials have been invented.

## Downloads and checkout

The three free resources and their source files are in `downloads/free/`. Public excerpts of the paid packs are in `downloads/samples/`.

**Keep complete paid products outside this repository and the published directory.** A static URL is not access control. Upload the full private ZIP files to the approved digital-download checkout provider for delivery after purchase.

Until live product checkout URLs are configured, paid product pages offer an email enquiry and public sample. They do not simulate a purchase or expose the full pack. No payment credentials are needed in the site.

After creating and activating the Lemon Squeezy store, upload each paid ZIP, set its approved price, and copy its live checkout link into `content/site.json`:

```json
{
  "products": {
    "ai-strategy-working-pack": {
      "checkoutUrl": "https://YOUR-STORE.lemonsqueezy.com/buy/YOUR-PRODUCT-ID",
      "priceLabel": "APPROVED PRICE AND CURRENCY"
    },
    "ai-pilot-decision-pack": {
      "checkoutUrl": "https://YOUR-STORE.lemonsqueezy.com/buy/YOUR-PRODUCT-ID",
      "priceLabel": "APPROVED PRICE AND CURRENCY"
    }
  }
}
```

The example values above are documentation only; do not copy them as live links. Rebuild and run the checker after configuration. Test the provider's checkout and delivery before announcing availability. Consulting engagements continue through the enquiry and proposal process.

Free downloads require no email address. Contact links open an email to `info@authentia.ca`; no message is submitted by the website itself. The former direct Analytics embed and third-party form scripts are replaced by explicit, revocable Google Analytics consent. Email and sample clicks are measured as clicks; the site does not manufacture leads or purchases.

The verified GA4 property uses `G-LP7BRQP3MV`. Google Analytics loads only after permission on the exact production HTTPS hosts. Ads features remain disabled in the implementation. All query strings and fragments are removed from measurement URLs, including UTM values; campaign-level attribution is intentionally limited. Cloudflare's existing cookieless performance monitoring is separate and disclosed in the privacy policy.

See [SEO research, account configuration and measurement checks](docs/seo-and-measurement.md) for primary sources, verified settings and remaining launch checks.

See [AI and digital change service research](docs/service-expansion-research.md) for the October 29, 2026 buyer-demand evidence, brand fit, offering structure and claim boundaries.

## Publishing

The existing Cloudflare Pages project is `site`, connected to `authentiadev/site`, with automatic production deployments from `main`. Use the build command `node scripts/build-site.mjs && node scripts/prepare-publish.mjs` and build output directory `dist`. Keep complete paid products outside both the repository and publish output.

Cloudflare serves physical `page.html` files at clean `/page` URLs. Canonical links, internal navigation, structured data, sitemap and Analytics page locations use those same URLs. The local preview matches this behavior. `_redirects` normalises four older trailing-slash URLs, and `_headers` prevents download files from competing with their canonical resource pages in search.

Google Search Console domain ownership is verified through a DNS TXT record; keep the record. Its Search generative AI setting is Include (Default). The bare domain permanently redirects to the canonical `https://www.authentia.ca`, preserving paths and query strings.

After deploying, verify real HTTP statuses, canonical pages, robots, sitemap and consent behavior, then submit the live sitemap. Confirm actual consented GA receipt in Realtime/DebugView before describing collection as verified. A static check or tag ID alone cannot establish live receipt.

The source generator and checker perform no deployment, account creation, email sending, or payment operations.
