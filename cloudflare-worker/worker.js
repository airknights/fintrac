/**
 * Fintrac — Cloudflare Worker (Plaid Proxy)
 *
 * This worker proxies requests to the Plaid API, injecting your credentials
 * from Cloudflare environment secrets. It is the ONLY piece of code that runs
 * outside the browser. Financial transaction data flows directly between the
 * browser and Plaid — this worker is only called for requests that require
 * your client_secret (link token creation and token exchange).
 *
 * Environment variables (set in Cloudflare dashboard → Worker → Settings → Variables):
 *   PLAID_CLIENT_ID  — from https://dashboard.plaid.com
 *   PLAID_SECRET     — sandbox / development / production secret
 *   PLAID_ENV        — "sandbox" | "development" | "production"
 *   ALLOWED_ORIGIN   — your app URL e.g. https://fintrac.pages.dev (or * for dev)
 */

const PLAID_HOSTS = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
}

// Only these Plaid endpoints are allowed through the proxy
const ALLOWED_PATHS = new Set([
  '/link/token/create',
  '/item/public_token/exchange',
  '/transactions/sync',
  '/accounts/get',
  '/item/get',
  '/institutions/get_by_id',
])

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || '*'

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
    }

    // Strip leading /plaid prefix the React app sends
    const url = new URL(request.url)
    const plaidPath = url.pathname.replace(/^\/plaid/, '')

    if (!ALLOWED_PATHS.has(plaidPath)) {
      return new Response('Endpoint not permitted', { status: 403, headers: corsHeaders })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return new Response('Invalid JSON body', { status: 400, headers: corsHeaders })
    }

    const plaidEnv = (env.PLAID_ENV || 'sandbox')
    const host = PLAID_HOSTS[plaidEnv] ?? PLAID_HOSTS.sandbox

    const plaidRes = await fetch(`${host}${plaidPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Plaid-Version': '2020-09-14',
      },
      body: JSON.stringify({
        ...body,
        client_id: env.PLAID_CLIENT_ID,
        secret: env.PLAID_SECRET,
      }),
    })

    const data = await plaidRes.json()

    return new Response(JSON.stringify(data), {
      status: plaidRes.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  },
}
