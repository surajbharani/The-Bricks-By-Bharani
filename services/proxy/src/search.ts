export async function handleSearch(request: Request): Promise<Response> {
  const { query } = await request.json() as { query?: string };
  if (!query) return new Response(JSON.stringify({ error: 'query required' }), { status: 400 });

  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'NanoBricks/1.0' } });
  if (!res.ok) return new Response(JSON.stringify({ error: 'Search failed' }), { status: 502 });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}
