use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;

// ── Agent run request (mirrors serve.py schema) ───────────────────────────────
#[derive(serde::Deserialize, Debug)]
pub struct AgentRunRequest {
    pub query: String,
    pub mode: String,          // "solo" | "swarm"
    pub model: String,
    pub workspace: Option<String>,
    pub token: String,
    pub caps: serde_json::Value,
}

/// Spawn the Agent Nano Bricks sidecar, stream its stdout JSON-lines
/// back to the React frontend as Tauri events.
#[tauri::command]
pub async fn agent_run(
    app: AppHandle,
    request: AgentRunRequest,
) -> Result<(), String> {
    // Default workspace: Documents/Nano Bricks
    let workspace = match &request.workspace {
        Some(p) if !p.is_empty() => PathBuf::from(p),
        _ => dirs::document_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Nano Bricks"),
    };
    std::fs::create_dir_all(&workspace).ok();

    let req_json = serde_json::json!({
        "query":     request.query,
        "mode":      request.mode,
        "model":     request.model,
        "workspace": workspace.to_string_lossy(),
        "token":     request.token,
        "caps":      request.caps,
    })
    .to_string();

    // Spawn the sidecar
    let sidecar = app
        .shell()
        .sidecar("agent-nano-bricks")
        .map_err(|e| format!("Failed to find sidecar: {e}"))?;

    let (mut rx, mut child) = sidecar
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;

    // Write request to sidecar stdin
    if let Some(stdin) = child.stdin.take() {
        let mut stdin = stdin;
        writeln!(stdin, "{}", req_json)
            .map_err(|e| format!("Failed to write to sidecar stdin: {e}"))?;
    }

    // Relay stdout JSON-lines to React via Tauri events
    use tauri_plugin_shell::process::CommandEvent;
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let line_str = String::from_utf8_lossy(&line).to_string();
                // Emit each JSON event line to frontend
                let _ = app.emit("agent-event", &line_str);
            }
            CommandEvent::Stderr(line) => {
                let msg = String::from_utf8_lossy(&line).to_string();
                let err_event = serde_json::json!({"t": "error", "message": msg}).to_string();
                let _ = app.emit("agent-event", &err_event);
            }
            CommandEvent::Terminated(_) => break,
            _ => {}
        }
    }

    Ok(())
}

/// Stop the running agent (kills the sidecar process)
#[tauri::command]
pub fn agent_stop() {
    // In a full implementation this would signal the child process.
    // For now, the sidecar respects the spend/step caps and stops itself.
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![agent_run, agent_stop])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
