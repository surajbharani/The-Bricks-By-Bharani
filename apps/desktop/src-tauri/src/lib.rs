use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_shell::ShellExt;

#[derive(serde::Deserialize, Debug)]
pub struct AgentRunRequest {
    pub query: String,
    pub mode: String,
    pub model: String,
    pub workspace: Option<String>,
    pub token: String,
    pub openrouter_key: Option<String>,
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
        "query":          request.query,
        "mode":           request.mode,
        "model":          request.model,
        "workspace":      workspace.to_string_lossy(),
        "token":          request.token,
        "openrouter_key": request.openrouter_key.unwrap_or_default(),
        "caps":           request.caps,
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

#[tauri::command]
fn run_code(lang: String, code: String) -> Result<String, String> {
    use std::io::Write as _;
    use std::process::{Command, Stdio};

    let ext = match lang.as_str() {
        "python" | "py" => "py",
        "javascript" | "js" | "node" => "js",
        "bash" | "sh" => "sh",
        _ => return Err(format!("Unsupported language: {lang}")),
    };

    let tmp_path = std::env::temp_dir().join(format!("nb_run_{}.{}", std::process::id(), ext));
    {
        let mut f = std::fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
        f.write_all(code.as_bytes()).map_err(|e| e.to_string())?;
    }

    let program = match ext {
        "py" => "python3",
        "js" => "node",
        _    => "bash",
    };

    let mut child = Command::new(program)
        .arg(&tmp_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run {program}: {e}"))?;

    // Wait with timeout via a separate thread
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let result = child.wait_with_output();
        let _ = tx.send(result);
    });

    let output = rx
        .recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "Timed out after 10 seconds".to_string())?
        .map_err(|e| e.to_string())?;

    let _ = std::fs::remove_file(&tmp_path);

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}{}", stdout, stderr);
    let truncated = if combined.len() > 4000 {
        format!("{}…(truncated)", &combined[..4000])
    } else {
        combined
    };

    Ok(truncated)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let handle = app.handle().clone();
            // Forward deep-link URLs to the frontend so auth can complete
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    let _ = handle.emit("auth-deep-link", url.as_str());
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![agent_run, agent_stop, run_code])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
