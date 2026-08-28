/**
 * POST /api/subscribe — puts a subscriber into HighLevel. Netlify build.
 *
 * Identical behaviour to functions/api/subscribe.js (the Cloudflare Pages
 * version); only the handler signature differs. Both are kept so the site can
 * move hosts without the form changing.
 *
 * Environment variables (Netlify: Site configuration > Environment variables):
 *   GHL_TOKEN        Private Integration token, scoped contacts.write
 *   GHL_LOCATION_ID  The sub-account subscribers belong to
 *   GHL_TAG          Optional, defaults to biohackhealth-subscriber
 */

const GHL_API = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

const reply = (status, body) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

const looksLikeEmail = (e) =>
  typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length < 254;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Method not allowed.' });

  const { GHL_TOKEN, GHL_LOCATION_ID, GHL_TAG } = process.env;
  if (!GHL_TOKEN || !GHL_LOCATION_ID) {
    console.error('[subscribe] GHL_TOKEN or GHL_LOCATION_ID is not set');
    return reply(503, { ok: false, error: 'Subscriptions are not configured yet.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return reply(400, { ok: false, error: 'Bad request.' });
  }

  // Honeypot: real people never fill a field they cannot see.
  if (payload.company) return reply(200, { ok: true });

  const email = String(payload.email || '').trim().toLowerCase();
  if (!looksLikeEmail(email)) return reply(400, { ok: false, error: 'Enter a valid email address.' });

  const res = await fetch(`${GHL_API}/contacts/upsert`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GHL_TOKEN}`,
      Version: GHL_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      locationId: GHL_LOCATION_ID,
      email,
      source: 'biohackhealth.uk',
      tags: [GHL_TAG || 'biohackhealth-subscriber'],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[subscribe] HighLevel ${res.status}:`, JSON.stringify(data));
    return reply(502, { ok: false, error: 'Could not subscribe you just now. Please try again.' });
  }

  console.log(`[subscribe] upserted ${email} -> contact ${data?.contact?.id || 'unknown'}`);
  return reply(200, { ok: true });
};
