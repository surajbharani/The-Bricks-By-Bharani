export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export async function searchWeb(query: string): Promise<SearchResult[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Search request failed');

  const data = await res.json() as {
    AbstractText?: string;
    AbstractURL?: string;
    AbstractSource?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Name?: string; Topics?: unknown[] }>;
  };

  const results: SearchResult[] = [];

  if (data.AbstractText) {
    results.push({
      title: data.AbstractSource ?? 'Summary',
      snippet: data.AbstractText,
      url: data.AbstractURL ?? '',
    });
  }

  for (const topic of data.RelatedTopics ?? []) {
    if (results.length >= 5) break;
    if (!topic.Text || !topic.FirstURL || topic.Topics) continue;
    results.push({
      title: topic.Text.split(' - ')[0] ?? topic.Text,
      snippet: topic.Text,
      url: topic.FirstURL,
    });
  }

  return results.slice(0, 5);
}

export function formatResultsAsContext(query: string, results: SearchResult[]): string {
  if (results.length === 0) return `[Web search for "${query}" returned no results]`;
  const lines = results.map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\n${r.url}`);
  return `[Web search results for "${query}"]\n\n${lines.join('\n\n')}`;
}
