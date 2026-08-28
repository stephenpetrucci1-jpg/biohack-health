# Biohack Health

Static rebuild of biohackhealth.uk. Every page is finished HTML: no framework,
no hydration, no client-side rendering. The only JavaScript is the category
filter and the subscribe form, about 40 lines in total.

## Why it was rebuilt

The original was built in GHL Studio. Three problems, in order of cost:

1. **The homepage showed 1 of 6 articles.** A search filter for "Compounding"
   had been baked into the rendered page, so five posts were invisible to
   anyone landing on the site.
2. **3.09 MB of unoptimised PNGs.** Seven hero images, all full-size PNG, one
   of them 705 KB and used as the site logo.
3. **The served HTML carried no CSS classes.** The stylesheet is Tailwind,
   which is entirely class-based, so anything fetching the page without a
   browser, search engine crawlers included, received an unstyled document.

## What changed

| | Before | After |
| --- | --- | --- |
| Images (all 7, both widths) | 3.09 MB PNG | 433 KB AVIF |
| Largest single image | 705 KB | 45 KB |
| Homepage articles visible | 1 | 6 |
| Homepage transfer | ~940 KB | 154 KB |
| Article page transfer | ~700 KB | 33 KB |
| Client JavaScript | none, but unstyled without a browser | 40 lines, page works without it |

Colours are the original site's own custom properties, read out of its
stylesheet, so this matches rather than approximates it. Inter is self-hosted
instead of pulled from Google Fonts, removing a render-blocking third-party
request. Light and dark both follow the reader's system setting.

## Layout

```
src/posts.json      content for all six articles, extracted from the live site
src/imagemap.json   original CDN image id -> local basename
src/build.js        the generator: templates, CSS, feeds
public/             images (AVIF + WebP, 1376w and 688w), Inter, favicon
functions/api/      Cloudflare Pages Functions
dist/               build output, not committed
```

## Build

```bash
npm install
node src/build.js     # writes dist/
npx http-server dist  # preview on http://127.0.0.1:8080
```

## Hosting

The domain was bought inside HighLevel, so its DNS zone lives in HighLevel's
Cloudflare account rather than ours. Cloudflare Pages will not accept a custom
domain whose zone belongs to another account, so the live site runs on Netlify,
which accepts a domain pointed at it from any DNS provider. The Cloudflare
Pages build still works and is kept as a fallback; the only difference between
them is the subscribe function's handler signature.

## Deploy to Netlify

```bash
npm install -g netlify-cli
netlify login
node src/build.js
netlify deploy --prod --dir=dist --functions=netlify/functions
```

Set `GHL_TOKEN` and `GHL_LOCATION_ID` under Site configuration, Environment
variables. Then point the domain by adding these records in HighLevel,
Settings, Domains, DNS records:

| Type | Name | Content |
| --- | --- | --- |
| A | biohackhealth.uk | 75.2.60.5 |
| CNAME | www | <your-site>.netlify.app |

Delete the two existing records first, the apex `A` to `162.159.140.166` and
`www` to `vibe.ludicrous.cloud`, both of which point at HighLevel.

## Deploy to Cloudflare Pages (fallback)

```bash
npx wrangler pages project create biohack-health --production-branch main
npx wrangler pages deploy dist --project-name biohack-health
```

Then point `biohackhealth.uk` at the Pages project in the Cloudflare
dashboard, under Custom domains. Keep the GHL site published until DNS has
propagated so nothing is offline in between.

## HighLevel lead capture

The subscribe form posts to `/api/subscribe`, a Pages Function that upserts
the contact into HighLevel and tags it. No HighLevel script loads in the
browser, which is the point: embedding one of their forms would drag the
bundle this rebuild removed straight back onto the page.

Set these in the Pages project under Settings, Environment variables, marked
encrypted:

| Variable | Value |
| --- | --- |
| `GHL_TOKEN` | Private Integration token for the sub-account, scoped `contacts.write` |
| `GHL_LOCATION_ID` | The sub-account id subscribers should land in |
| `GHL_TAG` | Optional, defaults to `biohackhealth-subscriber` |

Create the token in the sub-account under Settings, Private Integrations.

Subscribers arrive as contacts tagged `biohackhealth-subscriber` with source
`biohackhealth.uk`, so a workflow can trigger on the tag.

## Adding a post

Add an entry to `src/posts.json` and rebuild. Fields: `slug`, `title`, `dek`,
`description`, `category`, `readTime`, `author`, `initials`, `role`, `date`,
`hero`, `bodyHtml`. Categories in the nav are derived from the posts, so a new
category appears on its own.

Drop the hero image into `public/img/` as `<slug>.avif`, `<slug>-688.avif` and
the matching `.webp` pair. `src/build.js` has the sharp settings used for the
originals: AVIF quality 52, WebP quality 78, widths 1376 and 688.
