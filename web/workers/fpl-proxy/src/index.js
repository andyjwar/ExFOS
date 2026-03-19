/**
 * CORS proxy for read-only FPL API calls:
 * - fantasy.premierleague.com/api/* (bootstrap-static, event/{gw}/live, …)
 * - draft/* → draft.premierleague.com/api/* (bootstrap-static, event/{gw}/live, entry picks — draft ID space)
 * Avoid * + / in this block comment — it would end the comment early.
 * Deploy: cd web/workers/fpl-proxy && npm run deploy
 */
const FANTASY_API = 'https://fantasy.premierleague.com/api';
const DRAFT_API = 'https://draft.premierleague.com/api';

function corsHeaders(env, request) {
  const origin = request.headers.get('Origin');
  const allow =
    env.ALLOW_ORIGIN?.trim() || origin || '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env) {
    const ch = corsHeaders(env, request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: ch });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: ch });
    }

    const url = new URL(request.url);
    let path = url.pathname.replace(/^\/+/, '');
    if (path.includes('..') || path.startsWith('//')) {
      return new Response('Bad path', { status: 400, headers: ch });
    }

    let upstreamBase = FANTASY_API;
    if (path.startsWith('draft/')) {
      path = path.slice('draft/'.length);
      upstreamBase = DRAFT_API;
    }
    const target = `${upstreamBase}/${path}${url.search}`;
    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'TCLOT-fpl-proxy/1.0',
      },
    });

    const outHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(ch)) {
      outHeaders.set(k, v);
    }
    // Avoid browsers caching live JSON for too long when upstream sends long TTL
    outHeaders.delete('Set-Cookie');

    return new Response(upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    });
  },
};
