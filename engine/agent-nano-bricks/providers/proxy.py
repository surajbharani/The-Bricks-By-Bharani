"""Provider: routes model calls through the Nano Bricks proxy or OpenRouter directly."""
from openai import OpenAI

PROXY_BASE_URL = "https://api.nanobricks.app/v1"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# INR per 1K tokens (mirrors services/proxy/src/types.ts)
_PRICING = {
    "deepseek/deepseek-chat-v4-flash": (0.023, 0.092),
    "deepseek/deepseek-reasoner":      (0.115, 0.46),
}
_DEFAULT_PRICE = (0.084, 0.336)


def estimate_inr(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    inp, out = _PRICING.get(model, _DEFAULT_PRICE)
    return (prompt_tokens / 1000) * inp + (completion_tokens / 1000) * out


def normalize_model(model: str) -> str:
    """Strip leading 'openrouter/' prefix that OpenRouter itself doesn't expect."""
    if model.startswith("openrouter/"):
        return model[len("openrouter/"):]
    return model


def make_client(jwt: str) -> OpenAI:
    return OpenAI(
        base_url=PROXY_BASE_URL,
        api_key=jwt,  # Supabase JWT as Bearer token
        default_headers={"Authorization": f"Bearer {jwt}"},
        max_retries=2,
        timeout=120.0,
    )


def make_openrouter_client(api_key: str) -> OpenAI:
    return OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=api_key,
        default_headers={
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://nanobricks.app",
            "X-Title": "Nano Bricks",
        },
        max_retries=2,
        timeout=120.0,
    )
