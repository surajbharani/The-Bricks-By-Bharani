export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  domain: string;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
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

  if (data.AbstractText && data.AbstractURL) {
    results.push({
      title: data.AbstractSource ?? 'Summary',
      snippet: data.AbstractText,
      url: data.AbstractURL,
      domain: extractDomain(data.AbstractURL),
    });
  }

  for (const topic of data.RelatedTopics ?? []) {
    if (results.length >= 6) break;
    if (!topic.Text || !topic.FirstURL || topic.Topics) continue;
    results.push({
      title: topic.Text.split(' - ')[0] ?? topic.Text,
      snippet: topic.Text,
      url: topic.FirstURL,
      domain: extractDomain(topic.FirstURL),
    });
  }

  return results.slice(0, 6);
}

export function formatResultsAsContext(query: string, results: SearchResult[]): string {
  if (results.length === 0) return `[Web search for "${query}" returned no results. Answer from your training knowledge.]`;
  const lines = results.map((r, i) => `[${i + 1}] ${r.title}\nSource: ${r.url}\n${r.snippet}`);
  return `[Web search results for "${query}"]\n\n${lines.join('\n\n')}\n\nBased on the above web sources, provide a comprehensive, well-structured answer. Cite sources by number [1], [2] etc. where relevant.`;
}
