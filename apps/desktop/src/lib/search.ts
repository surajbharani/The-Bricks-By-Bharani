const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_SEARCH_KEY as string | undefined;
const GOOGLE_CX  = import.meta.env.VITE_GOOGLE_SEARCH_CX  as string | undefined;
const YOUTUBE_KEY = import.meta.env.VITE_YOUTUBE_KEY as string | undefined;

export const hasGoogleSearch  = !!(GOOGLE_KEY && GOOGLE_CX);
export const hasYouTubeSearch = !!(YOUTUBE_KEY || GOOGLE_KEY);

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface YoutubeResult {
  title: string;
  channel: string;
  videoId: string;
  url: string;
}

export async function googleSearch(query: string): Promise<SearchResult[]> {
  if (!GOOGLE_KEY || !GOOGLE_CX) return [];
  try {
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(query)}&num=4`
    );
    if (!res.ok) return [];
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.items ?? []).slice(0, 4).map((item: any) => ({
      title:   item.title,
      snippet: item.snippet?.replace(/\n/g, ' ') ?? '',
      url:     item.link,
    }));
  } catch {
    return [];
  }
}

export async function youtubeSearch(query: string): Promise<YoutubeResult[]> {
  const key = YOUTUBE_KEY || GOOGLE_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?key=${key}&q=${encodeURIComponent(query)}&part=snippet&type=video&maxResults=3`
    );
    if (!res.ok) return [];
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.items ?? []).map((item: any) => ({
      title:   item.snippet.title,
      channel: item.snippet.channelTitle,
      videoId: item.id.videoId,
      url:     `https://www.youtube.com/watch?v=${item.id.videoId}`,
    }));
  } catch {
    return [];
  }
}

export function formatSearchContext(results: SearchResult[], query: string): string {
  if (!results.length) return '';
  const lines = results.map(
    (r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.url}`
  );
  return `[Web Search: "${query}"]\n${lines.join('\n\n')}\n---\n\n`;
}

export function formatYouTubeContext(results: YoutubeResult[], query: string): string {
  if (!results.length) return '';
  const lines = results.map(
    (r, i) => `${i + 1}. "${r.title}" by ${r.channel}\n   ${r.url}`
  );
  return `[YouTube Search: "${query}"]\n${lines.join('\n\n')}\n---\n\n`;
}
