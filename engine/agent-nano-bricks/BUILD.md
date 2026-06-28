# Building the Agent Nano Bricks Sidecar

## Development (run without building)

```bash
cd engine/agent-nano-bricks
uv venv .venv --python 3.12
source .venv/bin/activate   # Windows: .venv\Scripts\activate
uv pip install -e .

# Test: send a request via stdin
echo '{"query":"List the files in the workspace","mode":"solo","model":"deepseek/deepseek-v4-flash","workspace":"/tmp/test-workspace","token":"YOUR_SUPABASE_JWT","caps":{"max_steps":5,"max_inr":1.0}}' | python serve.py
```

## Package as self-contained binary (Phase 9 — run on target OS)

```bash
pip install pyinstaller
pyinstaller serve.py \
  --name agent-nano-bricks \
  --onefile \
  --add-data "prompts:prompts" \
  --hidden-import openai \
  --hidden-import tiktoken \
  --hidden-import aiofiles
```

Output: `dist/agent-nano-bricks` (Linux/Mac) or `dist/agent-nano-bricks.exe` (Windows)

## Register as Tauri externalBin (Phase 9)

In `apps/desktop/src-tauri/tauri.conf.json`:
```json
{
  "bundle": {
    "externalBin": ["../../../engine/agent-nano-bricks/dist/agent-nano-bricks"]
  }
}
```

## Tauri sidecar invocation (Phase 7 — wire into Rust)

The Tauri command reads the sidecar binary, spawns it, passes the JSON
request via stdin, and relays stdout JSON-lines as Tauri events to React.

See `apps/desktop/src-tauri/src/agent.rs` (created in Phase 8 integration).
