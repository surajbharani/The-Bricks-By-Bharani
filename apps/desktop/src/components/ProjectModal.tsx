import { useEffect, useRef, useState } from 'react';
import { useProjects, type Project, type ProjectFile } from '../store/useProjects';

interface Props {
  project: Project | null;
  onClose: () => void;
}

export function ProjectModal({ project, onClose }: Props) {
  const { createProject, updateProject, addProjectFile, removeProjectFile, setActiveProject } = useProjects();

  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(project?.systemPrompt ?? '');
  const [memory, setMemory] = useState(project?.memory ?? '');
  const [tab, setTab] = useState<'general' | 'files' | 'memory'>('general');
  const fileRef = useRef<HTMLInputElement>(null);

  // Keep local files in sync when editing
  const files: ProjectFile[] = project ? useProjects.getState().projects.find((p) => p.id === project.id)?.files ?? [] : [];

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const save = () => {
    if (!name.trim()) return;
    if (project) {
      updateProject(project.id, { name: name.trim(), description, systemPrompt, memory });
    } else {
      const id = createProject(name.trim());
      updateProject(id, { description, systemPrompt, memory });
      setActiveProject(id);
    }
    onClose();
  };

  const handleFileAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!project) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    addProjectFile(project.id, {
      id: crypto.randomUUID(),
      name: file.name,
      text: text.slice(0, 8000),
      addedAt: Date.now(),
    });
    e.target.value = '';
  };

  const TABS = [
    { key: 'general', label: 'General' },
    { key: 'files', label: `Files${project?.files?.length ? ` (${project.files.length})` : ''}` },
    { key: 'memory', label: 'Memory' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-bg-panel border border-border-hair rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-hair">
          <h2 className="text-sm font-semibold text-text-hi">
            {project ? 'Edit Project' : 'New Project'}
          </h2>
          <button onClick={onClose} className="text-text-lo hover:text-text-hi transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-hair px-5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'border-red-core text-text-hi'
                  : 'border-transparent text-text-lo hover:text-text-hi'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {tab === 'general' && (
            <>
              <div>
                <label className="text-xs text-text-lo mb-1 block">Project name *</label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Research, Client Work, Writing"
                  className="w-full bg-bg-elevated border border-border-hair rounded-lg px-3 py-2 text-sm text-text-hi placeholder:text-text-lo focus:outline-none focus:border-red-core/50"
                />
              </div>
              <div>
                <label className="text-xs text-text-lo mb-1 block">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this project about?"
                  className="w-full bg-bg-elevated border border-border-hair rounded-lg px-3 py-2 text-sm text-text-hi placeholder:text-text-lo focus:outline-none focus:border-red-core/50"
                />
              </div>
              <div>
                <label className="text-xs text-text-lo mb-1 block">Project instructions (system prompt)</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="e.g. You are helping with academic research. Always cite sources. Use formal language."
                  rows={5}
                  className="w-full bg-bg-elevated border border-border-hair rounded-lg px-3 py-2 text-sm text-text-hi placeholder:text-text-lo focus:outline-none focus:border-red-core/50 resize-none font-mono"
                />
                <p className="text-[10px] text-text-lo mt-1">{systemPrompt.length} chars · prepended to every chat in this project</p>
              </div>
            </>
          )}

          {tab === 'files' && (
            <div className="space-y-3">
              <p className="text-xs text-text-lo">
                Files added here are included as context in every chat within this project.
              </p>
              {!project && (
                <p className="text-xs text-yellow-400/80 bg-yellow-400/10 rounded-lg px-3 py-2">
                  Save the project first to add files.
                </p>
              )}
              {project && (
                <>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border-hair hover:border-red-core/40 text-xs text-text-lo hover:text-text-hi transition-colors w-full justify-center"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Upload file (.txt, .md, .csv, .py, .json…)
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".txt,.md,.csv,.json,.py,.js,.ts,.html,.css"
                    className="hidden"
                    onChange={handleFileAdd}
                  />
                  {files.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 px-3 py-2 bg-bg-elevated rounded-lg border border-border-hair">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF1F2E" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-text-hi truncate">{f.name}</p>
                        <p className="text-[9px] text-text-lo">{f.text.length.toLocaleString()} chars</p>
                      </div>
                      <button
                        onClick={() => removeProjectFile(project.id, f.id)}
                        className="text-text-lo hover:text-red-core transition-colors flex-shrink-0"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {files.length === 0 && (
                    <p className="text-xs text-text-lo text-center py-4 opacity-50">No files yet</p>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'memory' && (
            <div>
              <label className="text-xs text-text-lo mb-1 block">Project memory</label>
              <textarea
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
                placeholder="Facts about this project that the AI should always know, e.g.:&#10;- Client is a fintech startup&#10;- Deadline is Q3 2025&#10;- Tech stack: React, FastAPI"
                rows={8}
                className="w-full bg-bg-elevated border border-border-hair rounded-lg px-3 py-2 text-sm text-text-hi placeholder:text-text-lo focus:outline-none focus:border-red-core/50 resize-none"
              />
              <p className="text-[10px] text-text-lo mt-1">Included as context in every chat in this project</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-border-hair">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-border-hair text-xs text-text-lo hover:text-text-hi hover:bg-bg-elevated transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!name.trim()}
            className="flex-1 px-4 py-2 rounded-lg bg-red-core text-white text-xs font-semibold hover:bg-red-core/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {project ? 'Save changes' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  );
}
