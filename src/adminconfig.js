/**
 * Configuration for the editor at /admin.
 *
 * Generated rather than hand-written so the cover-image list and the category
 * list always match what the site actually has. Decap CMS reads this file,
 * shows a form for every field below, and writes the result back to
 * content/<slug>.md as a git commit. Netlify then rebuilds from that commit.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/** Cover images already processed by `npm run images`, newest pass included. */
function libraryImages(root) {
  const dir = path.join(root, 'public', 'img');
  if (!fs.existsSync(dir)) return ['brand-og'];
  const names = new Set(
    fs.readdirSync(dir)
      .filter((f) => f.endsWith('.webp'))
      .map((f) => f.replace(/-688\.webp$/, '').replace(/\.webp$/, ''))
  );
  return [...names].sort();
}

function adminConfig(root, { categories, authors }) {
  return {
    backend: { name: 'git-gateway', branch: 'main' },
    // Saves land as drafts first, so nothing reaches the site until it is
    // explicitly published from the editor.
    publish_mode: 'editorial_workflow',
    media_folder: 'public/img/uploads',
    public_folder: '/img/uploads',
    site_url: 'https://biohackhealth.uk',
    logo_url: 'https://biohackhealth.uk/favicon.svg',
    collections: [
      {
        name: 'articles',
        label: 'Articles',
        label_singular: 'Article',
        folder: 'content',
        create: true,
        slug: '{{slug}}',
        extension: 'md',
        format: 'yaml-frontmatter',
        preview_path: 'blog/{{slug}}',
        summary: '{{title}}',
        sortable_fields: ['date', 'title'],
        fields: [
          { name: 'title', label: 'Headline', widget: 'string' },
          {
            name: 'seoTitle',
            label: 'Google headline',
            widget: 'string',
            required: false,
            hint: 'What shows in search results. Aim for under 60 characters. Leave blank to reuse the headline.',
          },
          { name: 'dek', label: 'Standfirst', widget: 'text', hint: 'The sentence under the headline.' },
          {
            name: 'description',
            label: 'Google description',
            widget: 'text',
            required: false,
            hint: 'Under 155 characters. Leave blank to reuse the standfirst.',
          },
          { name: 'category', label: 'Category', widget: 'select', options: categories, default: categories[0] },
          { name: 'author', label: 'Author', widget: 'string', hint: `Existing authors: ${authors.join(', ')}.` },
          { name: 'role', label: 'Author role', widget: 'string', hint: 'For example: Research Editor.' },
          { name: 'date', label: 'Date', widget: 'datetime', date_format: 'YYYY-MM-DD', time_format: false, picker_utc: true },
          {
            name: 'heroImage',
            label: 'Cover image (upload)',
            widget: 'image',
            required: false,
            hint: 'Upload a wide image, around 1376x768. Leave blank to pick one from the library below instead.',
          },
          {
            name: 'hero',
            label: 'Cover image (library)',
            widget: 'select',
            required: false,
            options: libraryImages(root),
            hint: 'Only used when no image is uploaded above.',
          },
          { name: 'heroAlt', label: 'Cover image description', widget: 'string', required: false, hint: 'What the image shows. Read out by screen readers and used by Google.' },
          {
            name: 'evidenceTier',
            label: 'Evidence level',
            widget: 'string',
            required: false,
            hint: 'For example: Preclinical, Human RCT, Phase 3.',
          },
          { name: 'evidenceNote', label: 'Evidence note', widget: 'text', required: false, hint: 'One sentence qualifying that level.' },
          { name: 'keyPoints', label: 'The short version', widget: 'list', required: false, hint: 'Three bullets at the top of the article.' },
          { name: 'tags', label: 'Tags', widget: 'list', required: false, hint: 'Used to pick the related articles at the foot of the page.' },
          {
            name: 'order',
            label: 'Position within the day',
            widget: 'number',
            required: false,
            value_type: 'int',
            hint: 'Only matters when several articles share a date. Lower shows first. Leave blank otherwise.',
          },
          { name: 'body', label: 'Article', widget: 'markdown' },
        ],
      },
    ],
  };
}

/** Write dist/admin/config.yml. */
function writeAdminConfig(root, dist, opts) {
  const dir = path.join(dist, 'admin');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.yml'), yaml.dump(adminConfig(root, opts), { lineWidth: -1 }));
}

module.exports = { writeAdminConfig };
