export const ALLOWED_ORIGIN = 'https://ghoststack.pages.dev';

export function corsHeaders(request) {
  const origin = request?.headers?.get('Origin') || '';
  const allowedOrigin = (origin === ALLOWED_ORIGIN || origin.endsWith('.ghoststack.pages.dev')) ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export function json(data, status = 200, request = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

export function err(message, status = 400, request = null) {
  return json({ ok: false, error: message }, status, request);
}
