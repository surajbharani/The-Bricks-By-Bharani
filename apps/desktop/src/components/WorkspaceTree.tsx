import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import type { FileActivity } from '../store/useRun';

interface Props {
  files: FileActivity[];
  workspaceDir?: string;
}

const ACTION_ICON: Record<FileActivity['action'], string> = {
  write: '+ ',
  edit: '~ ',
};

const ACTION_COLOR: Record<FileActivity['action'], string> = {
  write: '#28C76F',
  edit: '#FF9F43',
};

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

async function downloadFile(fullPath: string, name: string) {
  try {
    const bytes: number[] = await invoke('read_workspace_file', { path: fullPath });
    const blob = new Blob([new Uint8Array(bytes)]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Delay revoke so the browser has time to start the download
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.error('[WorkspaceTree] download failed:', err);
  }
}

export function WorkspaceTree({ files, workspaceDir }: Props) {
  if (files.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="text-xs text-text-lo font-mono uppercase tracking-wider mb-2">Files</p>
      <div className="space-y-0.5">
        <AnimatePresence initial={false}>
          {files.map((f, idx) => {
            const name = basename(f.path);
            // If path is already absolute, use it directly; otherwise join with workspaceDir
            const isAbsolute = f.path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(f.path);
            const fullPath = (isAbsolute || !workspaceDir) ? f.path : `${workspaceDir}/${f.path}`;
            return (
              <motion.div
                key={`${f.action}-${f.path}-${idx}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-2 py-0.5 group"
              >
                <span
                  className="text-xs font-mono flex-shrink-0"
                  style={{ color: ACTION_COLOR[f.action] }}
                >
                  {ACTION_ICON[f.action]}
                </span>
                <span
                  className="text-xs font-mono text-text-lo truncate flex-1"
                  title={f.path}
                >
                  {f.path}
                </span>
                {IS_TAURI && workspaceDir && (
                  <button
                    onClick={() => downloadFile(fullPath, name)}
                    title={`Download ${name}`}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-0.5 rounded hover:bg-white/10"
                  >
                    <DownloadIcon />
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 1v6M3.5 5L6 7.5 8.5 5" stroke="#9B9BA8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1 9.5h10" stroke="#9B9BA8" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
