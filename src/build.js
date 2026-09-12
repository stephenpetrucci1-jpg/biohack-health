/**
 * Biohack Health static site generator.
 *
 * Reads the Markdown files in content/ and writes a fully static dist/. No client framework,
 * no hydration: every page ships finished HTML so the content is there on
 * first paint and readable with JavaScript switched off. The only script is a
 * few lines for the category filter and the subscribe form.
 *
 *   node src/build.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://biohackhealth.uk';

const { loadMarkdownPosts } = require('./content.js');
const { writeAdminConfig } = require('./adminconfig.js');

const posts = loadMarkdownPosts();
const imagemap = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/imagemap.json'), 'utf8'));

const BRAND = 'Biohack Health';

/**
 * Google Search Console verification token.
 *
 * Set this to the content value of the HTML tag Search Console shows, e.g.
 * "abc123...". Verifying by meta tag rather than DNS is deliberate: the DNS
 * zone for this domain lives in HighLevel's Cloudflare account, so the
 * DNS-based flow cannot be completed from our side. Leave empty and no tag is
 * emitted.
 */
const GOOGLE_VERIFICATION = process.env.GOOGLE_VERIFICATION || '';

/**
 * Cloudflare Web Analytics token. Cookieless, so no consent banner is needed,
 * and the beacon is about 1.5 KB. Set CF_ANALYTICS_TOKEN in the build
 * environment to switch it on; leave it unset and no script is emitted.
 */
const CF_ANALYTICS_TOKEN = process.env.CF_ANALYTICS_TOKEN || 'e6c695df3a9045479f7704238a0c9329';

/** Where the shop link points, before per-article campaign tagging. */
const SHOP_URL = 'https://clydepeptides.com/';

/**
 * Tag the shop link per article so orders in HighLevel can be traced back to
 * the piece that produced them. Without this the blog is unattributable and
 * there is no way to tell which writing sells.
 */
const shopLink = (slug) =>
  `${SHOP_URL}?utm_source=biohackhealth&utm_medium=blog&utm_campaign=${encodeURIComponent(slug)}`;
const TAGLINE = 'Peptide Science, Research and Recovery';
const DESCRIPTION =
  'An educational journal covering peptide science, GLP-1 and metabolic research, recovery protocols, and the regulatory landscape.';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const esc = (s = '') =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Every image basename that public/img actually holds. */
const IMAGES = new Set(
  fs.existsSync(path.join(ROOT, 'public/img'))
    ? fs.readdirSync(path.join(ROOT, 'public/img'))
        .filter((f) => f.endsWith('.webp'))
        .map((f) => f.replace(/-688\.webp$/, '').replace(/\.webp$/, ''))
    : []
);

/**
 * Resolve a post's `hero` to an image basename.
 *
 * Posts written since the migration name the image directly. The originals
 * carried a CDN url from the old site, so those still go through imagemap.
 * A hero naming an image that does not exist falls back to the brand card,
 * and says so, because silently serving the wrong picture is how every
 * article ended up with the same one.
 */
const missingHeroes = new Set();
function imageName(hero) {
  const raw = String(hero || '');
  if (IMAGES.has(raw)) return raw;
  const mapped = imagemap[raw.split('/').pop().replace('.png', '')];
  if (mapped && IMAGES.has(mapped)) return mapped;
  if (raw) missingHeroes.add(raw);
  return 'brand-og';
}

/** Trailing hashtag block is markup, not prose: pull it out and parse it. */
/**
 * Give every table cell a data-label carrying its column heading, so the
 * stacked mobile layout can show which column a value belongs to.
 */
function labelTableCells(html) {
  return html.replace(/<table>[\s\S]*?<\/table>/g, (table) => {
    const heads = [...table.matchAll(/<th>(.*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
    if (!heads.length) return table;
    return table.replace(/<tr>([\s\S]*?)<\/tr>/g, (row, cells) => {
      if (row.includes('<th>')) return row;
      let i = 0;
      return row.replace(/<td>/g, () => {
        const label = heads[i % heads.length] || '';
        i += 1;
        return label ? `<td data-label="${label.replace(/"/g, '&quot;')}">` : '<td>';
      });
    });
  });
}

function splitTags(bodyHtml) {
  const m = bodyHtml.match(/<div>((?:<a href="[^"]*\?q=[^"]*">#[^<]*<\/a>)+)<\/div>\s*$/);
  if (!m) return { body: bodyHtml, tags: [] };
  const tags = [...m[1].matchAll(/>#([^<]+)</g)].map((t) => t[1]);
  return { body: bodyHtml.slice(0, m.index), tags };
}

/** Responsive picture with AVIF first, WebP fallback, and no layout shift. */
function picture(name, alt, { eager = false, sizes = '(max-width: 760px) 100vw, 720px' } = {}) {
  const load = eager ? 'eager" fetchpriority="high' : 'lazy';
  return `<picture>
  <source type="image/avif" srcset="/img/${name}-688.avif 688w, /img/${name}.avif 1376w" sizes="${sizes}">
  <source type="image/webp" srcset="/img/${name}-688.webp 688w, /img/${name}.webp 1376w" sizes="${sizes}">
  <img src="/img/${name}.webp" alt="${esc(alt)}" width="1376" height="768" loading="${load}" decoding="async">
</picture>`;
}

/**
 * Cover images uploaded through the editor at /admin have not been through the
 * sharp pass in src/images.js, so they are served through Netlify's image CDN,
 * which resizes and re-encodes them on the fly. The markup is the same shape as
 * picture() so the layout does not care which kind of image a post has.
 */
function uploadedPicture(src, alt, { eager = false, sizes = '(max-width: 760px) 100vw, 720px' } = {}) {
  const load = eager ? 'eager" fetchpriority="high' : 'lazy';
  const cdn = (w, fm) => `/.netlify/images?url=${encodeURIComponent(src)}&w=${w}&fm=${fm}`;
  return `<picture>
  <source type="image/avif" srcset="${cdn(688, 'avif')} 688w, ${cdn(1376, 'avif')} 1376w" sizes="${sizes}">
  <source type="image/webp" srcset="${cdn(688, 'webp')} 688w, ${cdn(1376, 'webp')} 1376w" sizes="${sizes}">
  <img src="${cdn(1376, 'webp')}" alt="${esc(alt)}" width="1376" height="768" loading="${load}" decoding="async">
</picture>`;
}

/** A post's cover image, whichever of the two kinds it has. */
function heroPicture(post, alt, opts) {
  return post.heroImage
    ? uploadedPicture(post.heroImage, alt, opts)
    : picture(imageName(post.hero), alt, opts);
}

/** Social-card URL. Library images are names; uploads are site-root paths. */
const ogUrl = (v) => (/^\//.test(v) ? SITE + v : `${SITE}/img/${v}.webp`);

const CATEGORIES = [...new Set(posts.map((p) => p.category))];

/**
 * With only a handful of articles, internal links are the strongest on-site
 * signal available: they spread authority and give crawlers a route to every
 * page from every page. Body links are editorial and sparse, so each article
 * also ends with the three most related pieces, ranked by shared tags and then
 * by category.
 */
function relatedTo(post) {
  return posts
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({
      post: p,
      score:
        p.tags.filter((t) => post.tags.includes(t)).length * 2 +
        (p.category === post.category ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.post);
}

/** "14 min read" -> ISO 8601 duration, for schema.org timeRequired. */
const isoDuration = (readTime) => `PT${(readTime.match(/\d+/) || [5])[0]}M`;

/** Rough word count of the article body, for schema.org wordCount. */
const wordCount = (html) =>
  html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

/**
 * Google truncates descriptions around 155 characters and titles around 60.
 * Cut on a word boundary so the snippet reads as a sentence rather than a
 * fragment ending mid-word.
 */
function clamp(text, max) {
  if (!text || text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '') + '…';
}

/**
 * The brand suffix helps click-through, but only when there is room for it.
 * These headlines are long and descriptive, so on those the article title
 * alone is the better use of the pixels.
 */
/**
 * The <title> is a search result headline, not the page headline. Articles use
 * a shorter keyword-first version and carry no brand suffix: Google appends the
 * site name itself, and spending characters on it pushes the distinctive words
 * past the truncation point. The homepage keeps the brand, since that is the
 * result people search the brand to find.
 */
const pageTitle = (post) => post.seoTitle || post.title;

/**
 * Body links were authored as absolute URLs without a trailing slash, so every
 * internal click cost a redirect hop. Rewrite them to root-relative paths that
 * match where the pages actually live.
 */
function normaliseLinks(html) {
  return html
    .replace(/href="https:\/\/biohackhealth\.uk\/blog\/([a-z0-9-]+)\/?"/g, 'href="/blog/$1/"')
    .replace(/href="https:\/\/biohackhealth\.uk\/\?/g, 'href="/?')
    .replace(/href="https:\/\/biohackhealth\.uk\/"/g, 'href="/"');
}

/* ------------------------------------------------------------------ */
/* styles                                                              */
/* ------------------------------------------------------------------ */

/**
 * Palette lifted from the original site's own custom properties so the
 * rebuild matches it rather than approximating. Light is the default; the
 * dark values are the site's own and follow the reader's system setting.
 */
const CSS = `
:root{
  --background:150 20% 99%; --foreground:200 28% 12%;
  --card:0 0% 100%; --muted:180 16% 95%; --muted-foreground:200 12% 45%;
  --primary:178 60% 28%; --primary-foreground:150 30% 98%;
  --accent:178 45% 92%; --accent-foreground:178 60% 22%;
  --border:180 16% 90%;
  --maxw:720px;
}
/* One theme everywhere. Following the reader's system setting meant the site
   looked different on a phone in light mode and a laptop in dark mode, which
   reads as a bug rather than a feature for a publication. */
:root{color-scheme:light}

@font-face{font-family:Inter;src:url(/fonts/inter.woff2) format('woff2');
  font-weight:300 700;font-display:swap;font-style:normal}

*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:hsl(var(--background));color:hsl(var(--foreground));
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased}
img,picture{max-width:100%;height:auto;display:block}
a{color:inherit}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 20px}
.wrap-wide{max-width:1080px;margin:0 auto;padding:0 20px}

/* header */
header.site{position:sticky;top:0;z-index:20;backdrop-filter:blur(10px);
  background:hsl(var(--background)/.86);border-bottom:1px solid hsl(var(--border))}
header.site .bar{display:flex;align-items:center;gap:22px;height:62px}
.brand{display:flex;align-items:center;gap:9px;font-weight:600;letter-spacing:-.01em;
  text-decoration:none;font-size:16px;white-space:nowrap}
.brand .dot{width:11px;height:11px;border-radius:50%;background:hsl(var(--primary));flex:none}
header.site nav{display:flex;gap:18px;margin-left:auto;font-size:14.5px}
header.site nav a{color:hsl(var(--muted-foreground));text-decoration:none}
header.site nav a:hover,header.site nav a[aria-current]{color:hsl(var(--foreground))}
.btn{display:inline-block;border:0;cursor:pointer;border-radius:8px;padding:9px 16px;
  font:inherit;font-size:14.5px;font-weight:500;text-decoration:none;
  background:hsl(var(--primary));color:hsl(var(--primary-foreground))}
.btn:hover{filter:brightness(1.08)}
/* At phone widths the brand, four nav links and the button do not fit on one
   row and pushed the page into a horizontal scroll. The categories are still
   reachable from the filters on the journal page and from the footer. */
@media (max-width:680px){
  header.site nav{display:none}
  header.site .bar{height:56px;gap:12px}
  .brand{font-size:15px}
  .btn{padding:8px 14px;font-size:14px}
}

/* hero */
.hero{padding:64px 0 30px}
.hero .eyebrow{color:hsl(var(--primary));font-weight:600;font-size:13px;
  letter-spacing:.09em;text-transform:uppercase;margin:0 0 14px}
.hero h1{font-size:clamp(32px,5.2vw,46px);line-height:1.12;letter-spacing:-.028em;margin:0 0 16px;font-weight:600}
.hero p{color:hsl(var(--muted-foreground));font-size:18.5px;margin:0;max-width:56ch}

/* filters */
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:26px 0 6px;
  border-bottom:1px solid hsl(var(--border));margin-bottom:32px}
.chip{border:1px solid hsl(var(--border));background:transparent;color:hsl(var(--muted-foreground));
  border-radius:999px;padding:6px 14px;font:inherit;font-size:13.5px;cursor:pointer}
.chip[aria-pressed="true"]{background:hsl(var(--accent));color:hsl(var(--accent-foreground));
  border-color:transparent;font-weight:500}
.filters input[type=search]{margin-left:6px;flex:0 1 210px;min-width:150px;padding:6px 12px;
  font:inherit;font-size:13.5px;border:1px solid hsl(var(--border));border-radius:999px;
  background:transparent;color:hsl(var(--foreground))}
.filters input[type=search]:focus{outline:2px solid hsl(var(--primary));outline-offset:1px}
.count{margin-left:auto;color:hsl(var(--muted-foreground));font-size:13.5px}
.empty{color:hsl(var(--muted-foreground));font-size:15px;margin:0 0 26px}
.empty button{background:none;border:0;padding:0;font:inherit;color:hsl(var(--primary));
  text-decoration:underline;cursor:pointer}

/* cards */
.grid{display:grid;gap:34px;padding-bottom:12px}
@media(min-width:900px){.grid{grid-template-columns:1fr 1fr;gap:38px 30px}
  .grid .card:first-child{grid-column:1/-1;display:grid;grid-template-columns:1.05fr 1fr;gap:28px;align-items:center}}
.card{display:block;text-decoration:none}
.card picture img{border-radius:12px;border:1px solid hsl(var(--border));aspect-ratio:16/9;object-fit:cover}
.card .meta{display:flex;gap:10px;align-items:center;font-size:12.5px;
  color:hsl(var(--muted-foreground));margin:14px 0 8px}
.tag{background:hsl(var(--accent));color:hsl(var(--accent-foreground));
  border-radius:999px;padding:3px 10px;font-weight:600;font-size:11.5px;
  letter-spacing:.05em;text-transform:uppercase}
.card h2{font-size:21px;line-height:1.3;letter-spacing:-.018em;margin:0 0 8px;font-weight:600}
.grid .card:first-child h2{font-size:27px}
.card:hover h2{color:hsl(var(--primary))}
.card p{color:hsl(var(--muted-foreground));font-size:15.5px;margin:0 0 10px}
.byline{font-size:13px;color:hsl(var(--muted-foreground))}

/* article */
article.post{padding:44px 0 10px}
.crumbs{display:flex;gap:8px;align-items:center;font-size:13.5px;color:hsl(var(--muted-foreground))}
.crumbs a{text-decoration:none}
.crumbs a:hover{color:hsl(var(--primary))}
.related{border-top:1px solid hsl(var(--border));margin-top:52px;padding-top:34px}
.related h2{font-size:15px;text-transform:uppercase;letter-spacing:.07em;margin:0 0 18px;
  color:hsl(var(--muted-foreground));font-weight:600}
.related ul{list-style:none;margin:0;padding:0;display:grid;gap:16px}
.related a{display:block;text-decoration:none;padding:16px 18px;border-radius:12px;
  border:1px solid hsl(var(--border));background:hsl(var(--card))}
.related a:hover{border-color:hsl(var(--primary))}
.related .t{display:block;font-weight:600;font-size:16.5px;margin:9px 0 5px;letter-spacing:-.012em}
.related a:hover .t{color:hsl(var(--primary))}
.related .d{display:block;color:hsl(var(--muted-foreground));font-size:14.5px}
article.post h1{font-size:clamp(29px,4.6vw,40px);line-height:1.14;
  letter-spacing:-.028em;margin:18px 0 16px;font-weight:600}
article.post .dek{font-size:19px;color:hsl(var(--muted-foreground));margin:0 0 26px}
.author{display:flex;align-items:center;gap:12px;padding:18px 0;
  border-top:1px solid hsl(var(--border));border-bottom:1px solid hsl(var(--border));margin-bottom:30px}
.avatar{width:38px;height:38px;border-radius:50%;flex:none;display:grid;place-items:center;
  background:hsl(var(--accent));color:hsl(var(--accent-foreground));font-size:13px;font-weight:600}
.author .n{font-weight:600;font-size:14.5px}
.author .r{color:hsl(var(--muted-foreground));font-size:13px}
article.post > picture img{border-radius:12px;border:1px solid hsl(var(--border));margin-bottom:34px}

.prose>div>p:first-child strong:first-child{color:hsl(var(--primary))}
.prose h2{font-size:25px;line-height:1.25;letter-spacing:-.02em;margin:44px 0 14px;font-weight:600}
.prose h3{font-size:19px;line-height:1.35;margin:32px 0 10px;font-weight:600}
.prose p{margin:0 0 20px}
.prose ul,.prose ol{margin:0 0 20px;padding-left:22px}
.prose li{margin:0 0 9px}
.prose strong{font-weight:600}
.prose a{color:hsl(var(--primary));text-decoration:underline;text-underline-offset:2px}
.prose hr{border:0;border-top:1px solid hsl(var(--border));margin:38px 0}
.prose blockquote{margin:26px 0;padding:2px 0 2px 20px;
  border-left:3px solid hsl(var(--primary));color:hsl(var(--muted-foreground))}
.prose table{width:100%;border-collapse:collapse;margin:0 0 24px;font-size:15px}
.prose th,.prose td{border:1px solid hsl(var(--border));padding:9px 12px;text-align:left;vertical-align:top}
.prose th{background:hsl(var(--muted));font-weight:600}
/* On a phone a wide table becomes a sideways scroll that readers skip. Below
   640px each row becomes its own card and each cell carries its column name,
   so the data is read rather than swiped past. */
@media (max-width:640px){
  .prose table,.prose tbody,.prose tr,.prose td{display:block;width:100%}
  .prose thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  .prose tr{border:1px solid hsl(var(--border));border-radius:10px;margin:0 0 14px;
    padding:4px 0;background:hsl(var(--card))}
  .prose td{border:0;border-bottom:1px solid hsl(var(--border));padding:10px 14px}
  .prose tr td:last-child{border-bottom:0}
  .prose td::before{content:attr(data-label);display:block;font-size:11.5px;font-weight:600;
    letter-spacing:.06em;text-transform:uppercase;color:hsl(var(--muted-foreground));margin-bottom:3px}
  .prose td:empty{display:none}
}
.prose em{color:hsl(var(--muted-foreground))}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin:36px 0 0}
.tags a{font-size:13px;color:hsl(var(--muted-foreground));background:hsl(var(--muted));
  border-radius:999px;padding:5px 12px;text-decoration:none}
.tags a:hover{color:hsl(var(--primary))}

/* the short version */
.keypoints{border:1px solid hsl(var(--border));border-left:3px solid hsl(var(--primary));
  border-radius:10px;padding:22px 24px;margin:0 0 34px;background:hsl(var(--muted)/.55)}
.keypoints h2{margin:0 0 12px;font-size:12.5px;letter-spacing:.09em;text-transform:uppercase;
  color:hsl(var(--muted-foreground));font-weight:600}
.keypoints ul{margin:0;padding-left:20px}
.keypoints li{margin:0 0 8px;font-size:16px;line-height:1.5}
.keypoints li:last-child{margin-bottom:0}
.keypoints .evnote{margin:14px 0 0;padding-top:13px;border-top:1px solid hsl(var(--border));
  font-size:14px;color:hsl(var(--muted-foreground))}
.tag.tier{background:transparent;border:1px solid hsl(var(--border));color:hsl(var(--muted-foreground))}

/* commercial recommendation */
/* compact version, sits above the article rather than after it */
.promo-bar{display:flex;gap:16px;align-items:center;flex-wrap:wrap;
  border:1px solid hsl(var(--primary)/.3);background:hsl(var(--accent));
  border-radius:12px;padding:14px 18px;margin:26px 0 4px}
.promo-bar p{margin:0;font-size:14.5px;line-height:1.45;flex:1 1 320px;
  color:hsl(var(--accent-foreground))}
.promo-bar p b{font-weight:600}
.promo-bar .btn{font-size:14px;padding:9px 17px;flex:none;white-space:nowrap}
@media (max-width:560px){.promo-bar .btn{width:100%;text-align:center}}

/* subscribe */
.subscribe{background:hsl(var(--muted));border:1px solid hsl(var(--border));
  border-radius:14px;padding:34px 28px;margin:64px 0;text-align:center}
.subscribe h2{margin:0 0 8px;font-size:22px;letter-spacing:-.018em;font-weight:600}
.subscribe p{margin:0 0 20px;color:hsl(var(--muted-foreground));font-size:15px}
.subscribe form{display:flex;gap:9px;max-width:430px;margin:0 auto;flex-wrap:wrap}
.subscribe input{flex:1 1 220px;min-width:0;padding:11px 14px;font:inherit;font-size:15px;
  border:1px solid hsl(var(--border));border-radius:8px;
  background:hsl(var(--background));color:hsl(var(--foreground))}
.subscribe input:focus{outline:2px solid hsl(var(--primary));outline-offset:1px}
.subscribe .note{margin:14px 0 0;font-size:13px;min-height:19px}
.subscribe .note.ok{color:hsl(var(--primary))}
.subscribe .note.err{color:#c0392b}

/* footer */
footer.site{border-top:1px solid hsl(var(--border));margin-top:56px;padding:40px 0 56px;
  color:hsl(var(--muted-foreground));font-size:14px}
footer.site .cols{display:flex;gap:44px;flex-wrap:wrap;margin-bottom:26px}
footer.site h3{font-size:13px;text-transform:uppercase;letter-spacing:.07em;
  margin:0 0 10px;color:hsl(var(--foreground))}
footer.site a{color:inherit;text-decoration:none;display:block;margin-bottom:7px}
footer.site a:hover{color:hsl(var(--primary))}
footer.site .fine{border-top:1px solid hsl(var(--border));padding-top:20px;font-size:13px}
.hidden{display:none!important}
`;

/* ------------------------------------------------------------------ */
/* layout                                                              */
/* ------------------------------------------------------------------ */

function layout({ title, description, canonical, ogImage, jsonLd = [], body, wide = false, article = null }) {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${GOOGLE_VERIFICATION ? `<meta name="google-site-verification" content="${esc(GOOGLE_VERIFICATION)}">` : ''}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="alternate" type="application/rss+xml" title="${BRAND}" href="/rss.xml">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${wide ? 'website' : 'article'}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogUrl(ogImage)}">
<meta property="og:image:width" content="1376">
<meta property="og:image:height" content="768">
<meta property="og:image:alt" content="${esc(title)}">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ogUrl(ogImage)}">
${article ? `<meta property="article:published_time" content="${article.published}">
<meta property="article:modified_time" content="${article.published}">
<meta property="article:author" content="${esc(article.author)}">
<meta property="article:section" content="${esc(article.section)}">
<meta name="author" content="${esc(article.author)}">` : ''}
<style>${CSS}</style>
${jsonLd.length ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
${CF_ANALYTICS_TOKEN ? `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${CF_ANALYTICS_TOKEN}"}'></script>` : ''}
</head>
<body>
<header class="site"><div class="${wide ? 'wrap-wide' : 'wrap'} bar">
  <a class="brand" href="/"><span class="dot"></span>${BRAND}</a>
  <nav>
    ${CATEGORIES.map((c) => `<a href="/?category=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}
    <a href="/">All Articles</a>
  </nav>
  <a class="btn" href="/#subscribe">Subscribe</a>
</div></header>
${body}
<footer class="site"><div class="${wide ? 'wrap-wide' : 'wrap'}">
  <div class="cols">
    <div style="flex:2 1 260px">
      <h3>${BRAND}</h3>
      <p style="margin:0;max-width:42ch">Clear, responsible writing on peptide science and health optimisation for curious learners and researchers.</p>
    </div>
    <div><h3>Topics</h3>${CATEGORIES.map((c) => `<a href="/?category=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>
    <div><h3>More</h3><a href="/rss.xml">RSS feed</a><a href="/#subscribe">Subscribe</a></div>
  </div>
  <div class="fine">© ${new Date().getFullYear()} ${BRAND}. Educational content only.<br>
  Not medical advice. Always consult qualified professionals.</div>
</div></footer>
</body>
</html>`;
}

/**
 * Commercial recommendation.
 *
 * It sits above the article, directly under the hero image, where every reader
 * sees it. Deliberately one line with no heading of its own: a sponsored h2
 * above the prose would compete with the article's own structure and push the
 * content the page ranks for further down.
 *
 * rel="sponsored" declares the commercial relationship to search engines, and
 * target="_blank" keeps the article open behind it.
 */
const clydeBar = (slug) => `
<aside class="promo-bar">
  <p><b>Buying peptides?</b> Clyde Peptides publishes a third-party certificate of analysis for
     every batch. Educational use only, not for human consumption.</p>
  <a class="btn" href="${shopLink(slug)}" target="_blank" rel="noopener noreferrer sponsored">Visit Clyde Peptides</a>
</aside>`;

const subscribeBlock = `
<section class="subscribe" id="subscribe">
  <h2>Get the next post in your inbox</h2>
  <p>One thoughtful email when we publish. No spam, no hype, just peptide science you can trust.</p>
  <form id="sub" novalidate>
    <label for="sub-email" class="hidden">Email address</label>
    <input id="sub-email" type="email" name="email" placeholder="you@example.com" required autocomplete="email">
    <input class="hidden" type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button class="btn" type="submit">Subscribe</button>
  </form>
  <p class="note" id="sub-note" role="status" aria-live="polite"></p>
</section>
<script>
/* Netlify Identity invite and password-reset links land on the site root with
   a token in the hash. The widget is only fetched when one is present, so
   ordinary visitors never download it. */
(function(){
  if(!/^#(invite_token|recovery_token|confirmation_token)=/.test(location.hash)) return;
  var s=document.createElement('script');
  s.src='https://identity.netlify.com/v1/netlify-identity-widget.js';
  s.onload=function(){ window.netlifyIdentity.on('login', function(){ location.href='/admin/'; }); };
  document.head.appendChild(s);
})();
(function(){
  var f=document.getElementById('sub'); if(!f) return;
  var note=document.getElementById('sub-note'), btn=f.querySelector('button');
  f.addEventListener('submit', function(e){
    e.preventDefault();
    var email=f.email.value.trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){
      note.className='note err'; note.textContent='Enter a valid email address.'; return;
    }
    btn.disabled=true; note.className='note'; note.textContent='Subscribing…';
    fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:email,company:f.company.value})})
      .then(function(r){return r.json().catch(function(){return {ok:r.ok};});})
      .then(function(d){
        btn.disabled=false;
        if(d.ok){ note.className='note ok'; note.textContent='Thanks. You are on the list.'; f.reset(); }
        else { note.className='note err'; note.textContent=d.error||'Something went wrong. Try again.'; }
      })
      .catch(function(){ btn.disabled=false; note.className='note err';
        note.textContent='Network error. Try again.'; });
  });
})();
</script>`;

/* ------------------------------------------------------------------ */
/* pages                                                               */
/* ------------------------------------------------------------------ */

function cardFor(p, first) {
  return `<a class="card" href="/blog/${p.slug}/" data-category="${esc(p.category)}"
  data-search="${esc((p.title + ' ' + p.dek + ' ' + p.category + ' ' + p.author).toLowerCase())}">
  ${heroPicture(p, p.title, {
    eager: first,
    sizes: first ? '(max-width:900px) 100vw, 520px' : '(max-width:900px) 100vw, 380px',
  })}
  <div>
    <div class="meta"><span class="tag">${esc(p.category)}</span><span>${esc(p.date)}</span><span>·</span><span>${esc(p.readTime)}</span></div>
    <h2>${esc(p.title)}</h2>
    <p>${esc(p.dek)}</p>
    <div class="byline">${esc(p.author)} · ${esc(p.role)}</div>
  </div>
</a>`;
}

function buildIndex() {
  const body = `<main class="wrap-wide">
  <section class="hero">
    <p class="eyebrow">Journal</p>
    <h1>${TAGLINE}</h1>
    <p>In-depth stories, reports and perspectives on performance, recovery and longevity.</p>
  </section>
  <div class="filters">
    <button class="chip" data-filter="ALL" aria-pressed="true">All</button>
    ${CATEGORIES.map((c) => `<button class="chip" data-filter="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}
    <label class="hidden" for="q">Search articles</label>
    <input id="q" type="search" placeholder="Search articles" autocomplete="off" spellcheck="false">
    <span class="count" id="count">${posts.length} articles</span>
  </div>
  <p class="empty hidden" id="empty">No articles match that search. <button type="button" id="reset">Show all</button></p>
  <div class="grid" id="grid">${posts.map((p, i) => cardFor(p, i === 0)).join('\n')}</div>
  ${subscribeBlock}
</main>
<script>
(function(){
  var grid=document.getElementById('grid'), count=document.getElementById('count');
  var empty=document.getElementById('empty'), reset=document.getElementById('reset');
  var q=document.getElementById('q');
  var cards=[].slice.call(grid.children), chips=[].slice.call(document.querySelectorAll('.chip'));
  var cat='ALL';

  function apply(){
    var term=q.value.trim().toLowerCase(), n=0;
    cards.forEach(function(c){
      var show=(cat==='ALL'||c.dataset.category===cat) && (!term||c.dataset.search.indexOf(term)>-1);
      c.classList.toggle('hidden', !show); if(show) n++;
    });
    chips.forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.filter===cat)); });
    count.textContent = n + (n===1?' article':' articles');
    empty.classList.toggle('hidden', n>0);
    // Reflect state in the URL so a filtered view can be shared, without
    // adding history entries for every keystroke.
    var params=new URLSearchParams();
    if(cat!=='ALL') params.set('category',cat);
    if(term) params.set('q',q.value.trim());
    var s=params.toString();
    history.replaceState(null,'', s ? '/?'+s : '/');
  }

  chips.forEach(function(b){ b.addEventListener('click', function(){ cat=b.dataset.filter; apply(); }); });
  q.addEventListener('input', apply);
  reset.addEventListener('click', function(){ cat='ALL'; q.value=''; apply(); q.focus(); });

  // Deep links such as /?category=News or /?q=bpc arrive pre-filtered.
  var sp=new URLSearchParams(location.search);
  var c0=sp.get('category'), q0=sp.get('q');
  if(c0 && chips.some(function(b){return b.dataset.filter===c0;})) cat=c0;
  if(q0) q.value=q0;
  if(c0||q0) apply();
})();
</script>`;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: BRAND,
      url: SITE + '/',
      logo: { '@type': 'ImageObject', url: `${SITE}/img/brand-og.webp` },
      description: DESCRIPTION,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: BRAND,
      url: SITE + '/',
      description: DESCRIPTION,
      blogPost: posts.map((p) => ({
        '@type': 'BlogPosting',
        headline: p.title,
        url: `${SITE}/blog/${p.slug}/`,
        datePublished: new Date(p.date).toISOString().slice(0, 10),
        author: { '@type': 'Person', name: p.author },
      })),
    },
  ];

  write('index.html', layout({
    title: `${BRAND} — ${TAGLINE}`,
    description: clamp(DESCRIPTION, 155),
    canonical: SITE + '/',
    ogImage: 'brand-og',
    jsonLd, body, wide: true,
  }));
}

/**
 * Pull the FAQ section out of an article for FAQPage markup.
 *
 * Google shows these as expandable questions under the search result, which is
 * the single biggest click-through win available to a page that already ranks.
 * It reads the rendered prose rather than the source, so it works whether the
 * article came from Markdown or from the old site's HTML.
 *
 * Returns [] unless the section has at least two question headings, since a
 * lone question is not worth marking up and Google ignores it anyway.
 */
function faqFrom(prose) {
  const section = prose.match(/<h2[^>]*>\s*Frequently\s+[Aa]sked[^<]*<\/h2>([\s\S]*?)(?=<h2|$)/);
  if (!section) return [];

  const pairs = [];
  // Two shapes appear across the articles: a question as an h3, and a question
  // bolded at the head of its own paragraph.
  const patterns = [
    /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|$)/g,
    /<p>\s*<strong>([\s\S]*?)<\/strong>([\s\S]*?)<\/p>/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(section[1]))) {
      const question = stripTags(m[1]);
      const answer = stripTags(m[2]);
      if (question && answer) pairs.push({ question, answer });
    }
    if (pairs.length) break;
  }
  return pairs.length >= 2 ? pairs : [];
}

/** Markup text: tags out, entities back to characters, whitespace collapsed. */
function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPost(p) {
  const { body: rawProse, tags } = splitTags(p.bodyHtml);
  const prose = labelTableCells(normaliseLinks(rawProse));
  const iso = new Date(p.date).toISOString().slice(0, 10);

  const body = `<main class="wrap">
  <article class="post">
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="/">Journal</a><span aria-hidden="true">›</span>
      <a href="/?category=${encodeURIComponent(p.category)}">${esc(p.category)}</a>
    </nav>
    <div class="meta" style="display:flex;gap:10px;align-items:center;font-size:12.5px;margin:18px 0 0">
      <span class="tag">${esc(p.category)}</span>${p.evidenceTier ? `<span class="tag tier">${esc(p.evidenceTier)}</span>` : ''}<span>${esc(p.readTime)}</span>
    </div>
    <h1>${esc(p.title)}</h1>
    <p class="dek">${esc(p.dek)}</p>
    <div class="author">
      <span class="avatar">${esc(p.initials)}</span>
      <span><span class="n">${esc(p.author)}</span><br><span class="r">${esc(p.role)} · <time datetime="${iso}">${esc(p.date)}</time></span></span>
    </div>
    ${heroPicture(p, p.heroAlt || p.title, { eager: true, sizes: '(max-width:760px) 100vw, 720px' })}
    ${clydeBar(p.slug)}
    ${p.keyPoints && p.keyPoints.length ? `<section class="keypoints" aria-labelledby="kp">
      <h2 id="kp">The short version</h2>
      <ul>${p.keyPoints.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
      ${p.evidenceNote ? `<p class="evnote"><strong>Evidence: ${esc(p.evidenceTier)}.</strong> ${esc(p.evidenceNote)}</p>` : ''}
    </section>` : ''}
    <div class="prose">${prose}</div>
    ${tags.length ? `<div class="tags">${tags.map((t) => `<a href="/?q=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}
  </article>
  <section class="related" aria-labelledby="related-h">
    <h2 id="related-h">Related reading</h2>
    <ul>
      ${relatedTo(p).map((r) => `<li><a href="/blog/${r.slug}/">
        <span class="tag">${esc(r.category)}</span>
        <span class="t">${esc(r.title)}</span>
        <span class="d">${esc(clamp(r.dek, 110))}</span></a></li>`).join('')}
    </ul>
  </section>
  ${subscribeBlock}
</main>`;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: p.title,
      description: p.dek,
      image: ogUrl(p.heroImage || imageName(p.hero)),
      datePublished: iso,
      dateModified: iso,
      // The byline is the publication itself, so the author is the organisation
      // rather than a person. Claiming a named individual that does not exist
      // is exactly what Google's health-content guidelines look for.
      author: p.author === BRAND
        ? { '@type': 'Organization', name: BRAND, url: SITE }
        : { '@type': 'Person', name: p.author, jobTitle: p.role },
      publisher: {
        '@type': 'Organization',
        name: BRAND,
        logo: { '@type': 'ImageObject', url: `${SITE}/img/brand-og.webp` },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}/blog/${p.slug}/` },
      articleSection: p.category,
      keywords: tags.join(', '),
      wordCount: wordCount(prose),
      timeRequired: isoDuration(p.readTime),
      inLanguage: 'en-GB',
      isAccessibleForFree: true,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Journal', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: p.title, item: `${SITE}/blog/${p.slug}/` },
      ],
    },
  ];

  const faq = faqFrom(prose);
  if (faq.length) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    });
  }

  write(`blog/${p.slug}/index.html`, layout({
    title: pageTitle(p),
    description: clamp(p.description || p.dek, 155),
    canonical: `${SITE}/blog/${p.slug}/`,
    ogImage: p.heroImage || imageName(p.hero),
    article: { published: iso, author: p.author, section: p.category },
    jsonLd, body,
  }));
}

function buildFeeds() {
  const urls = [
    { loc: SITE + '/', pri: '1.0', freq: 'daily' },
    ...posts.map((p) => ({ loc: `${SITE}/blog/${p.slug}/`, pri: '0.8', freq: 'weekly',
      lastmod: new Date(p.date).toISOString().slice(0, 10) })),
  ];
  write('sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join('\n') +
    `\n</urlset>\n`);

  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${SITE}/sitemap.xml\n`);

  write('rss.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n` +
    `<title>${esc(BRAND)}</title>\n<link>${SITE}/</link>\n<description>${esc(DESCRIPTION)}</description>\n<language>en-gb</language>\n` +
    posts.map((p) => `<item><title>${esc(p.title)}</title><link>${SITE}/blog/${p.slug}/</link>` +
      `<guid>${SITE}/blog/${p.slug}/</guid><pubDate>${new Date(p.date).toUTCString()}</pubDate>` +
      `<description>${esc(p.dek)}</description><category>${esc(p.category)}</category></item>`).join('\n') +
    `\n</channel></rss>\n`);

  write('404.html', layout({
    title: `Page not found — ${BRAND}`,
    description: 'That page does not exist.',
    canonical: SITE + '/404.html',
    ogImage: 'brand-og',
    body: `<main class="wrap"><section class="hero"><p class="eyebrow">404</p>
      <h1>That page does not exist</h1>
      <p>The link may be out of date. <a href="/" style="color:hsl(var(--primary))">Back to the journal</a>.</p>
      </section></main>`,
  }));
}

/* ------------------------------------------------------------------ */

function write(rel, content) {
  const out = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, content);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
copyDir(path.join(ROOT, 'public'), DIST);
buildIndex();
posts.forEach(buildPost);
buildFeeds();
writeAdminConfig(ROOT, DIST, {
  categories: CATEGORIES,
  authors: [...new Set(posts.map((p) => p.author))].sort(),
});

let bytes = 0, files = 0;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f); else { bytes += fs.statSync(f).size; files++; }
  }
})(DIST);
if (missingHeroes.size) {
  console.log(`\n  no image found for: ${[...missingHeroes].join(', ')}`);
  console.log('  those posts fall back to the brand card. Run `npm run images` or fix the hero field.\n');
}
console.log(`built ${files} files, ${(bytes / 1024).toFixed(0)} KB total`);
console.log(`  index.html      ${(fs.statSync(path.join(DIST, 'index.html')).size / 1024).toFixed(1)} KB`);
console.log(`  a post page     ${(fs.statSync(path.join(DIST, 'blog', posts[0].slug, 'index.html')).size / 1024).toFixed(1)} KB`);
