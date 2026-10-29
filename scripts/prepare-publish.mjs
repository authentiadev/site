import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const pages = [
  'index.html', '404.html', 'about.html', 'approach.html', 'case-studies.html',
  'contact.html', 'insights.html', 'privacy.html', 'resources.html', 'services.html', 'terms.html',
  'services/ai-strategy.html', 'services/implementation-advisory.html', 'services/ongoing-advisory.html',
  'case-studies/cross-border-marketplace.html', 'case-studies/dental-technology-ai-pilot.html',
  'case-studies/financial-services-digital-experience.html',
  'insights/buy-adapt-or-build-ai.html', 'insights/choosing-your-first-ai-use-case.html',
  'insights/evaluating-an-ai-pilot-before-rollout.html', 'insights/from-prompts-to-reliable-workflows.html',
  'resources/ai-opportunity-scorecard.html', 'resources/ai-pilot-decision-pack.html',
  'resources/ai-strategy-working-pack.html', 'resources/pilot-readiness-checklist.html',
  'resources/workflow-brief-template.html'
];
const assetRoots = ['downloads', 'css', 'js', 'images', 'videos'];
const optionalFiles = ['robots.txt', 'sitemap.xml', 'llms.txt', '_redirects', '_headers', '.nojekyll'];
const freeIds = ['ai-opportunity-scorecard', 'workflow-brief-template', 'pilot-readiness-checklist'];
const publicZipPaths = new Set(freeIds.map(id => `downloads/free/${id}.zip`));
const forbiddenSegments = new Set(['content', 'scripts', 'docs', '.git', 'node_modules', 'dist', 'website products']);
const files = new Set();

async function metadata(filename) {
  try { return await fs.lstat(filename); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function allowedPath(relative) {
  const segments = relative.split('/');
  return !segments.some(segment => forbiddenSegments.has(segment.toLowerCase()) || segment.startsWith('.') || segment.toLowerCase() === '.ds_store');
}

async function addFile(relative, required = false) {
  const info = await metadata(path.join(root, relative));
  if (!info) {
    if (required) throw new Error(`Missing generated page ${relative}. Run node scripts/build-site.mjs first.`);
    return;
  }
  if (info.isSymbolicLink()) throw new Error(`Refusing to publish symbolic link: ${relative}`);
  if (!info.isFile()) throw new Error(`Expected a regular public file: ${relative}`);
  if (relative.toLowerCase().endsWith('.zip') && !publicZipPaths.has(relative)) {
    throw new Error(`Archive is not an approved free download: ${relative}`);
  }
  files.add(relative);
}

async function addAssets(relative) {
  if (!allowedPath(relative)) return;
  const info = await metadata(path.join(root, relative));
  if (!info) return;
  if (info.isSymbolicLink()) throw new Error(`Refusing to publish symbolic link: ${relative}`);
  if (info.isDirectory()) {
    const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      await addAssets(`${relative}/${entry.name}`);
    }
  } else if (info.isFile()) {
    await addFile(relative);
  }
}

// Validate every source before changing the owned output directory.
for (const page of pages) await addFile(page, true);
for (const assetRoot of assetRoots) await addAssets(assetRoot);
for (const optional of optionalFiles) await addFile(optional);
const existingOutput = await metadata(output);
if (existingOutput && (existingOutput.isSymbolicLink() || !existingOutput.isDirectory())) {
  throw new Error('Refusing to replace dist because it is not a regular directory.');
}
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Unexpected publish output path.');
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

let bytes = 0;
for (const relative of [...files].sort()) {
  const destination = path.join(output, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(root, relative), destination);
  bytes += (await fs.stat(destination)).size;
}

// A second inventory check catches accidental changes to publication boundaries.
async function verifyOutput(directory, prefix = '') {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Unexpected output symbolic link: ${relative}`);
    if (entry.isDirectory()) {
      if (!allowedPath(relative)) throw new Error(`Unexpected private output directory: ${relative}`);
      await verifyOutput(path.join(directory, entry.name), relative);
    } else if (!files.has(relative)) throw new Error(`Unexpected publish output: ${relative}`);
  }
}
await verifyOutput(output);
console.log(`Prepared dist with ${pages.length} generated pages and ${files.size - pages.length} public assets/metadata files (${(bytes / 1024 / 1024).toFixed(1)} MiB).`);
console.log('Excluded source content, scripts, docs, Git metadata, hidden files and unapproved archives. No deployment performed.');
