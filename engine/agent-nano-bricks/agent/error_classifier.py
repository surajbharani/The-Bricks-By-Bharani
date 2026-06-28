"""
Agent Nano Bricks — Error Classifier
Turns a raw provider exception into an actionable category so the loop can
decide whether to retry, compress, switch models, or stop.

Mirrors Hermes Agent's error_classifier.
"""
from __future__ import annotations

from enum import Enum


class ErrorKind(str, Enum):
    AUTH = "auth"                 # bad key / token — stop, surface clearly
    QUOTA = "quota"               # out of credits — stop
    RATE_LIMIT = "rate_limit"     # 429 — back off and retry
    CONTEXT_LENGTH = "context"    # too many tokens — compress then retry
    TIMEOUT = "timeout"           # network/timeout — retry
    SERVER = "server"             # 5xx — retry, maybe fallback
    BAD_REQUEST = "bad_request"   # 400 malformed — fallback model
    TRANSIENT = "transient"       # unknown but probably retryable
    FATAL = "fatal"               # unrecoverable


# Which kinds are worth retrying on the same model
RETRYABLE = {
    ErrorKind.RATE_LIMIT,
    ErrorKind.TIMEOUT,
    ErrorKind.SERVER,
    ErrorKind.TRANSIENT,
}

# Which kinds should trigger a model fallback rather than a plain retry
FALLBACKABLE = {
    ErrorKind.SERVER,
    ErrorKind.BAD_REQUEST,
}


def classify_api_error(err: Exception) -> ErrorKind:
    s = str(err).lower()
    code = getattr(err, "status_code", None) or getattr(err, "code", None)

    if "context length" in s or "maximum context" in s or "too many tokens" in s \
            or "reduce the length" in s or "context_length_exceeded" in s:
        return ErrorKind.CONTEXT_LENGTH

    if "401" in s or "invalid api key" in s or "unauthorized" in s \
            or "authentication" in s or code == 401:
        return ErrorKind.AUTH

    if "quota" in s or "insufficient" in s or "billing" in s \
            or "payment" in s or "credit" in s:
        return ErrorKind.QUOTA

    if "429" in s or "rate limit" in s or "too many requests" in s or code == 429:
        return ErrorKind.RATE_LIMIT

    if "timeout" in s or "timed out" in s or "connection" in s \
            or "network" in s or "read timed out" in s:
        return ErrorKind.TIMEOUT

    if "403" in s or code == 403:
        return ErrorKind.AUTH

    if code and isinstance(code, int) and 500 <= code < 600:
        return ErrorKind.SERVER
    if "500" in s or "502" in s or "503" in s or "504" in s \
            or "internal server error" in s or "bad gateway" in s \
            or "service unavailable" in s or "overloaded" in s:
        return ErrorKind.SERVER

    if "400" in s or "bad request" in s or "invalid" in s or code == 400:
        return ErrorKind.BAD_REQUEST

    return ErrorKind.TRANSIENT


def human_message(kind: ErrorKind) -> str:
    return {
        ErrorKind.AUTH: "Authentication failed. Please check your sign-in or API key.",
        ErrorKind.QUOTA: "You've run out of model credits. Please top up to continue.",
        ErrorKind.RATE_LIMIT: "The model is rate-limiting requests — retrying shortly.",
        ErrorKind.CONTEXT_LENGTH: "Conversation got long — compressing history and continuing.",
        ErrorKind.TIMEOUT: "Network timeout — retrying.",
        ErrorKind.SERVER: "The model provider had a server error — retrying.",
        ErrorKind.BAD_REQUEST: "Request was rejected — trying a fallback model.",
        ErrorKind.TRANSIENT: "Temporary error — retrying.",
        ErrorKind.FATAL: "An unrecoverable error occurred.",
    }.get(kind, "An error occurred.")
