use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;

#[derive(serde::Deserialize, Debug)]
pub struct AgentRunRequest {
    pub query: String,
    pub mode: String,
    pub model: String,
    pub workspace: Option<String>,
    pub token: String,
    pub caps: serde_json::Value,
}

// Commands are NOT pub — tauri v2 generate_handler! sees pub commands as both
// a local definition and a crate-root re-export, producing duplicate macro errors.
#[tauri::command]
async fn agent_run(app: AppHandle, request: AgentRunRequest) -> Result<(), String> {
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

    let sidecar = app
        .shell()
        .sidecar("agent-nano-bricks")
        .map_err(|e| format!("Failed to find sidecar: {e}"))?;

    let (mut rx, mut child) = sidecar
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;

    // tauri_plugin_shell v2: CommandChild exposes .write(), not .stdin
    child
        .write(format!("{}\n", req_json).as_bytes())
        .map_err(|e| format!("Failed to write to sidecar stdin: {e}"))?;

    use tauri_plugin_shell::process::CommandEvent;
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let line_str = String::from_utf8_lossy(&line).to_string();
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

#[tauri::command]
fn agent_stop() {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![agent_run, agent_stop])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
