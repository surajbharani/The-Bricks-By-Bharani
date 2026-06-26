"""Provider: routes all model calls through the Nano Bricks proxy."""
import json
from pathlib import Path
from openai import OpenAI

PROXY_BASE_URL = "https://api.nanobricks.app/v1"

# INR per 1K tokens (mirrors services/proxy/src/types.ts)
_PRICING = {
    "deepseek/deepseek-chat-v4-flash": (0.023, 0.092),
    "deepseek/deepseek-reasoner":      (0.115, 0.46),
}
_DEFAULT_PRICE = (0.084, 0.336)


def estimate_inr(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    inp, out = _PRICING.get(model, _DEFAULT_PRICE)
    return (prompt_tokens / 1000) * inp + (completion_tokens / 1000) * out


def make_client(jwt: str) -> OpenAI:
    return OpenAI(
        base_url=PROXY_BASE_URL,
        api_key=jwt,  # Supabase JWT as Bearer token
        default_headers={"Authorization": f"Bearer {jwt}"},
        max_retries=2,
        timeout=120.0,
    )
