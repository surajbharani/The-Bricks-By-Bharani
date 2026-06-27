export type ImageModel = 'openai/dall-e-3' | 'google/gemini-2.0-flash-exp:free';

export const IMAGE_MODELS: { id: ImageModel; label: string }[] = [
  { id: 'openai/dall-e-3',                label: 'DALL-E 3 (High quality)' },
  { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini Imagen (Fast)' },
];

export async function generateImage(
  prompt: string,
  model: ImageModel,
  token: string,
  proxyBase: string
): Promise<string> {
  const res = await fetch(`${proxyBase}/v1/image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ prompt, model }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
    throw new Error(err.error ?? `Image generation failed (${res.status})`);
  }

  const data = await res.json() as { url?: string; b64?: string };
  if (data.url) return data.url;
  if (data.b64) return `data:image/png;base64,${data.b64}`;
  throw new Error('No image returned from server');
}
