/**
 * Markdown posts.
 *
 * Every article is a Markdown file in content/. One file per article, named
 * after its URL slug. The build reads this directory and nothing else.
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
const yaml = require('js-yaml');

const CONTENT_DIR = path.resolve(__dirname, '..', 'content');

/** Split the YAML front matter block from the Markdown body. */
function parseFrontMatter(raw, file) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter block`);
  let meta;
  try {
    meta = yaml.load(m[1]) || {};
  } catch (e) {
    throw new Error(`${file}: front matter is not valid YAML - ${e.message}`);
  }
  return { meta, body: m[2] };
}

const REQUIRED = ['title', 'dek', 'category', 'author', 'role', 'date'];

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
    // Kept raw so sorting never depends on parsing the display string back.
    isoDate: meta.date instanceof Date ? meta.date.toISOString().slice(0, 10) : String(meta.date),
    // Lower runs first within a day. Older imports carry one; new posts need not.
    order: meta.order === undefined ? Number.MAX_SAFE_INTEGER : Number(meta.order),
    readTime: meta.readTime || `${Math.max(1, Math.round(words / 220))} min read`,
    evidenceTier: meta.evidenceTier || '',
    evidenceNote: meta.evidenceNote || '',
    hero: meta.hero,
    // Set when the cover image was uploaded through the editor at /admin.
    heroImage: meta.heroImage || '',
    heroAlt: meta.heroAlt || meta.title,
    tags: Array.isArray(meta.tags) ? meta.tags : String(meta.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    keyPoints: Array.isArray(meta.keyPoints) ? meta.keyPoints : [],
    bodyHtml: marked.parse(body, { mangle: false, headerIds: false }),
    fromMarkdown: true,
  };
}

/** Every Markdown post, newest first, ties broken by the order key. */
function loadMarkdownPosts() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => loadOne(path.join(CONTENT_DIR, f)))
    .sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate) || a.order - b.order);
}

module.exports = { loadMarkdownPosts };
