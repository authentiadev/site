# Authentia service resource library

Created and reviewed **29 October 2026**. Internal handoff; excluded from public publishing.

## New resource families

| Service | Free starter kit | Full private working pack |
| --- | --- | --- |
| AI and digital change management | `change-readiness-starter-kit` | `ai-digital-change-working-pack` |
| Workflow and operating model design | `workflow-design-starter-kit` | `workflow-operating-model-pack` |
| Practical AI governance | `ai-governance-starter-kit` | `practical-ai-governance-pack` |

Each free starter includes a printable HTML guide, two worksheet types with blank CSV templates and fictional examples, a formatted two-tab Excel workbook, five contextual prompts and a README. Each full pack includes a longer guide, six worksheet types and examples, a six-tab workbook, twelve prompts and a README. Every workbook tab places the blank template above its labelled fictional example. The records contain no formulas or automatic approvals.

Across these six bundles there are **24 worksheet types**, **48 CSV files**, **six Excel workbooks**, **51 prompts**, **six complete guides** and **72 source deliverable files**, plus **three public samples**. Each sample contains a genuine excerpt, fictional example and complete usable prompt. It does not expose the full private workbook or prompt collection.

The three full product folders and ZIPs are stored in `/Users/adrian/Work/Authentia/Website Products/`. They are outside this repository and the public build. Free folders and ZIPs are in `downloads/free/`; public samples are in `downloads/samples/`. The catalogue is `content/resources.json`, with a `service` field connecting each new resource to its service page. The homepage and resource index introduce the expanded collection.

## Editorial approach

The material supports client-owned decisions, implementation and operation. It helps teams produce readiness/impact records, sponsor and enablement plans, workflow maps, responsibility and exception routes, AI-use inventories, working guidance, supplier questions, oversight arrangements and review records. Prompts identify approved inputs, structured outputs and human review. They treat supplied documents as data and preserve missing evidence, assumptions and unconfirmed decisions.

All examples and measures are fictional. No client outcomes, certifications, compliance findings, prices or delivery commitments have been invented. The governance material connects with the client's specialist owners rather than interpreting country-specific law. The new workflow starter extends the existing Workflow Brief Template through step-level mapping and handoffs.

Primary references reviewed for context include [Skills England's AI upskilling briefing](https://www.gov.uk/government/publications/skills-for-ai-what-works-for-ai-upskilling-in-the-uk/insight-briefing-based-on-research-what-works-for-ai-upskilling-in-the-uk), [MIT CISR on enterprise IT operating models](https://cisr.mit.edu/publication/2025_1201_EntITOperatingModels_ThorogoodWoerner) and [NIST's voluntary AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework). The practical records and instructions are original Authentia materials, not reproductions of a licensed change methodology or claims of framework accreditation.

## Verification and maintenance

- Independent editorial review checked the new guides, prompts and examples. A mismatch between a workflow's boundary and its receiving-team acceptance step was corrected before packaging.
- All 24 workbook sheets were rendered and visually reviewed for complete headers, wrapped content, editable fields and separation from examples. Excel ZIP integrity, sheet counts and absence of formulas/macros were checked. CSVs were checked for complete rows, consistent fields and executable formula-like content.
- Each bundle's README inventory and ZIP members exactly match its source files and bytes. The new packaging helper creates reproducible archives and rejects full paid products placed inside the website repository.
- Site/source and packaged-output checks passed for **48 public HTML documents**, including **11 standalone noindex guides/samples**, **1,753 references**, **six public ZIP archives** and **36 canonical sitemap URLs**. Sixteen network-free Analytics scenarios passed, including recognition of every resource's page, download, sample and enquiry events.
- Browser QA covered resource filtering (six free and five paid), a starter page at 390 × 844, a full-pack landing page at desktop size and a standalone guide's three-page print preview.

Keep workbook, CSVs, guide, prompts, README and catalogue claims consistent when editing. Use `scripts/package-resources.py --resource SLUG` for a new free resource, or add `--private-root '/Users/adrian/Work/Authentia/Website Products'` for a full paid pack. Repeat `--resource` for multiple bundles. Regenerate and check the public site after catalogue or guide changes.

Paid pages currently provide samples and email enquiries; no product price or active checkout has been configured. Complete packs can be uploaded to an approved purchase-delivery provider when commercial terms and checkout are ready. Do not link full paid ZIPs from the static website.
