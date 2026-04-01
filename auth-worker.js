/**
 * Fintrac — Main Cloudflare Worker
 *
 * Handles:
 *   1. HTTP Basic Auth gate for the static app
 *   2. Plaid API proxy at /plaid/* (injects credentials server-side)
 *
 * Required secrets (set in Cloudflare dashboard → Worker → Settings → Variables):
 *   AUTH_USER        — basic auth username
 *   AUTH_PASS        — basic auth password
 *   PLAID_CLIENT_ID  — from https://dashboard.plaid.com
 *   PLAID_SECRET     — sandbox / development / production secret
 *
 * Plain vars (set in wrangler.toml or dashboard):
 *   PLAID_ENV        — "sandbox" | "development" | "production"
 *   ALLOWED_ORIGIN   — your app URL, e.g. https://fintrac.workers.dev (or *)
 */

const PLAID_HOSTS = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
}

const PLAID_ALLOWED_PATHS = new Set([
  '/link/token/create',
  '/item/public_token/exchange',
  '/transactions/sync',
  '/accounts/get',
  '/item/get',
  '/institutions/get_by_id',
])

function isAuthorized(request, env) {
  const authorization = request.headers.get('Authorization')
  if (!authorization) return false
  const [scheme, encoded] = authorization.split(' ')
  if (scheme !== 'Basic' || !encoded) return false
  const decoded = atob(encoded)
  const colon = decoded.indexOf(':')
  if (colon === -1) return false
  return decoded.slice(0, colon) === env.AUTH_USER && decoded.slice(colon + 1) === env.AUTH_PASS
}

async function handlePlaid(request, env) {
  const allowedOrigin = env.ALLOWED_ORIGIN || '*'
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  const url = new URL(request.url)
  const plaidPath = url.pathname.replace(/^\/plaid/, '')

  if (!PLAID_ALLOWED_PATHS.has(plaidPath)) {
    return new Response('Endpoint not permitted', { status: 403, headers: corsHeaders })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400, headers: corsHeaders })
  }

  const host = PLAID_HOSTS[env.PLAID_ENV] ?? PLAID_HOSTS.sandbox

  const plaidRes = await fetch(`${host}${plaidPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Plaid-Version': '2020-09-14' },
    body: JSON.stringify({ ...body, client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET }),
  })

  const data = await plaidRes.json()
  return new Response(JSON.stringify(data), {
    status: plaidRes.status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // Plaid proxy — skip basic auth (uses its own secret injection)
    if (url.pathname.startsWith('/plaid')) {
      return handlePlaid(request, env)
    }

    // Basic auth gate for the static app
    if (!isAuthorized(request, env)) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Fintrac", charset="UTF-8"' },
      })
    }

    return env.ASSETS.fetch(request)
  },
}
