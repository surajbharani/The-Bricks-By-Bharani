export async function handleSearch(request: Request): Promise<Response> {
  let body: { query?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { query } = body;
  if (!query || typeof query !== 'string') {
    return new Response(JSON.stringify({ error: 'query is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'NanoBricks/1.0 (https://nanobricks.app)' },
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: `Search upstream failed: ${res.status}` }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}
