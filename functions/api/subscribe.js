/**
 * POST /api/subscribe — puts a subscriber into HighLevel.
 *
 * Runs as a Cloudflare Pages Function, so the page itself stays static and no
 * HighLevel script ever loads in the browser. That matters: embedding a GHL
 * form would drag their whole bundle back onto a site rebuilt to be fast.
 *
 * Required environment variables (Pages project, Settings > Environment
 * variables, encrypted):
 *   GHL_TOKEN        Private Integration token for the sub-account,
 *                    scoped to contacts.write
 *   GHL_LOCATION_ID  The sub-account id the subscribers belong to
 * Optional:
 *   GHL_TAG          Tag applied to every contact (default biohackhealth-subscriber)
 */

const GHL_API = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

// Deliberately permissive: rejecting unusual but valid addresses loses real subscribers.
const looksLikeEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length < 254;

export async function onRequestPost({ request, env }) {
  if (!env.GHL_TOKEN || !env.GHL_LOCATION_ID) {
    console.error('[subscribe] GHL_TOKEN or GHL_LOCATION_ID is not set');
    return json({ ok: false, error: 'Subscriptions are not configured yet.' }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Bad request.' }, 400);
  }

  // Honeypot: real people never fill a field they cannot see.
  if (payload.company) return json({ ok: true });

  const email = String(payload.email || '').trim().toLowerCase();
  if (!looksLikeEmail(email)) return json({ ok: false, error: 'Enter a valid email address.' }, 400);

  const res = await fetch(`${GHL_API}/contacts/upsert`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GHL_TOKEN}`,
      Version: GHL_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      locationId: env.GHL_LOCATION_ID,
      email,
      source: 'biohackhealth.uk',
      tags: [env.GHL_TAG || 'biohackhealth-subscriber'],
      customFields: [],
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Never surface HighLevel's error text to the visitor; log it for us instead.
    console.error(`[subscribe] HighLevel ${res.status}:`, JSON.stringify(data));
    return json({ ok: false, error: 'Could not subscribe you just now. Please try again.' }, 502);
  }

  console.log(`[subscribe] upserted ${email} -> contact ${data?.contact?.id || 'unknown'}`);
  return json({ ok: true });
}

/** Anything other than POST has no business here. */
export const onRequest = ({ request }) =>
  request.method === 'POST' ? undefined : new Response('Method not allowed', { status: 405 });
