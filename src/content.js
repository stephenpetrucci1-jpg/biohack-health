/**
 * Markdown posts.
 *
 * The six original articles live in src/posts.json as HTML, because that is
 * how they came off the old site and their markup is worth preserving exactly.
 * Everything written from now on goes in content/ as Markdown, which is far
 * easier to write and edit. The build reads both and treats them identically.
 *
 * A post looks like this:
 *
 *   ---
 *   title: BPC-157 and tendon repair
 *   seoTitle: BPC-157 Tendon Repair: What the Evidence Shows
 *   dek: One sentence under the headline.
 *   description: The search result description, up to 155 characters.
 *   category: Research
 *   author: Dr. Elena Marsh
 *   role: Biochemist
 *   date: 2026-09-05
 *   readTime: 8 min read
 *   evidenceTier: Preclinical
 *   evidenceNote: One sentence qualifying the evidence level.
 *   hero: bpc-157-tendons
 *   heroAlt: What the image shows.
 *   tags: BPC-157, Tendons, Recovery
 *   keyPoints:
 *     - First thing a reader needs.
 *     - Second thing.
 *     - Third thing.
 *   ---
 *
 *   Body in Markdown. Headings with ##, tables with pipes, links as normal.
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const CONTENT_DIR = path.resolve(__dirname, '..', 'content');

/** Minimal front matter: scalars, comma lists, and "- " bullet lists. */
function parseFrontMatter(raw, file) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter block`);
  const meta = {};
  let currentList = null;

  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet && currentList) {
      meta[currentList].push(bullet[1].trim());
      continue;
    }
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    if (value === '') {
      meta[key] = [];
      currentList = key;
    } else {
      meta[key] = value.trim();
      currentList = null;
    }
  }
  return { meta, body: m[2] };
}

const REQUIRED = ['title', 'dek', 'category', 'author', 'role', 'date', 'hero'];

function loadOne(file) {
  const slug = path.basename(file, '.md');
  const { meta, body } = parseFrontMatter(fs.readFileSync(file, 'utf8'), path.basename(file));

  const missing = REQUIRED.filter((k) => !meta[k]);
  if (missing.length) throw new Error(`${slug}.md: missing ${missing.join(', ')}`);

  const words = body.replace(/[#>*_`|-]/g, ' ').split(/\s+/).filter(Boolean).length;

  return {
    slug,
    title: meta.title,
    seoTitle: meta.seoTitle || meta.title,
    dek: meta.dek,
    description: meta.description || meta.dek,
    category: meta.category,
    author: meta.author,
    role: meta.role,
    initials: meta.initials || meta.author.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
    // Stored as a plain date so the build can format and stamp it consistently.
    date: new Date(meta.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    readTime: meta.readTime || `${Math.max(1, Math.round(words / 220))} min read`,
    evidenceTier: meta.evidenceTier || '',
    evidenceNote: meta.evidenceNote || '',
    hero: meta.hero,
    heroAlt: meta.heroAlt || meta.title,
    tags: Array.isArray(meta.tags) ? meta.tags : String(meta.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    keyPoints: Array.isArray(meta.keyPoints) ? meta.keyPoints : [],
    bodyHtml: marked.parse(body, { mangle: false, headerIds: false }),
    fromMarkdown: true,
  };
}

/** Every Markdown post, newest first. Returns [] when content/ is empty. */
function loadMarkdownPosts() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => loadOne(path.join(CONTENT_DIR, f)))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

module.exports = { loadMarkdownPosts };
