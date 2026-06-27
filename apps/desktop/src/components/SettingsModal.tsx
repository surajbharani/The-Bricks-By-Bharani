import { useEffect, useState, type ReactNode } from 'react';
import { useMemory } from '../store/useMemory';
import { useAuth } from '../store/useAuth';
import { useTheme, type FontSize, type FontStyle, type BubbleDensity, type MessageWidth, type SidebarWidth, type SendKey } from '../store/useTheme';

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const { settings, facts, updateSettings, addFact, updateFact, deleteFact, clearAllFacts } = useMemory();
  const { user } = useAuth();
  const { fontSize, fontStyle, bubbleDensity, messageWidth, sidebarWidth, sendKey, notificationSound, setFontSize, setFontStyle, setBubbleDensity, setMessageWidth, setSidebarWidth, setSendKey, setNotificationSound } = useTheme();

  const [tab, setTab] = useState<'profile' | 'memory' | 'instructions' | 'appearance'>('profile');
  const [displayName, setDisplayName] = useState(settings.displayName);
  const [globalPrompt, setGlobalPrompt] = useState(settings.globalSystemPrompt);
  const [memoryEnabled, setMemoryEnabled] = useState(settings.memoryEnabled);
  const [newFact, setNewFact] = useState('');
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const saveProfile = () => {
    updateSettings({ displayName: displayName.trim(), globalSystemPrompt: globalPrompt, memoryEnabled });
    onClose();
  };

  const addNewFact = () => {
    const t = newFact.trim();
    if (!t) return;
    addFact(t);
    setNewFact('');
  };

  const commitEdit = (id: string) => {
    const t = editingText.trim();
    if (t) updateFact(id, t);
    setEditingFactId(null);
  };

  const avatar = (displayName || user?.email || '?')[0]?.toUpperCase();

  const TABS = [
    { key: 'profile',     label: 'Profile' },
    { key: 'memory',      label: `Memory${facts.length ? ` (${facts.length})` : ''}` },
    { key: 'instructions', label: 'Instructions' },
    { key: 'appearance',  label: 'Appearance' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-bg-panel border border-border-hair rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-hair">
          <h2 className="text-sm font-semibold text-text-hi">Settings</h2>
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
          {tab === 'profile' && (
            <>
              {/* Avatar preview */}
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-full bg-red-core/20 border border-red-core/30 flex items-center justify-center text-xl font-bold text-red-core">
                  {avatar}
                </div>
              </div>
              <div>
                <label className="text-xs text-text-lo mb-1 block">Display name</label>
                <input
                  autoFocus
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-bg-elevated border border-border-hair rounded-lg px-3 py-2 text-sm text-text-hi placeholder:text-text-lo focus:outline-none focus:border-red-core/50"
                />
              </div>
              <div>
                <label className="text-xs text-text-lo mb-1 block">Email</label>
                <input
                  readOnly
                  value={user?.email ?? ''}
                  className="w-full bg-bg-elevated border border-border-hair rounded-lg px-3 py-2 text-sm text-text-lo cursor-not-allowed"
                />
              </div>
            </>
          )}

          {tab === 'memory' && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-hi font-medium">Memory enabled</p>
                  <p className="text-[10px] text-text-lo mt-0.5">AI remembers facts about you across chats</p>
                </div>
                <button
                  onClick={() => setMemoryEnabled((v) => !v)}
                  className={`w-10 h-5 rounded-full relative transition-colors ${memoryEnabled ? 'bg-red-core' : 'bg-bg-elevated border border-border-hair'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${memoryEnabled ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>

              <div className="h-px bg-border-hair" />

              {/* Add new fact */}
              <div className="flex gap-2">
                <input
                  value={newFact}
                  onChange={(e) => setNewFact(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addNewFact(); }}
                  placeholder="Add a fact, e.g. I prefer Python over JavaScript"
                  className="flex-1 bg-bg-elevated border border-border-hair rounded-lg px-3 py-2 text-xs text-text-hi placeholder:text-text-lo focus:outline-none focus:border-red-core/50"
                />
                <button
                  onClick={addNewFact}
                  disabled={!newFact.trim()}
                  className="px-3 py-2 rounded-lg bg-red-core/15 border border-red-core/30 text-red-core text-xs hover:bg-red-core/25 transition-colors disabled:opacity-40"
                >
                  Add
                </button>
              </div>

              {/* Facts list */}
              {facts.length === 0 && (
                <p className="text-xs text-text-lo text-center py-6 opacity-50">No facts saved yet</p>
              )}
              {facts.map((f) => (
                <div key={f.id} className="group flex items-start gap-2 px-3 py-2 bg-bg-elevated rounded-lg border border-border-hair">
                  <span className="text-red-core mt-0.5 flex-shrink-0">·</span>
                  {editingFactId === f.id ? (
                    <input
                      autoFocus
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(f.id); if (e.key === 'Escape') setEditingFactId(null); }}
                      onBlur={() => commitEdit(f.id)}
                      className="flex-1 bg-transparent text-xs text-text-hi focus:outline-none"
                    />
                  ) : (
                    <span
                      className="flex-1 text-xs text-text-hi cursor-text"
                      onClick={() => { setEditingFactId(f.id); setEditingText(f.text); }}
                    >
                      {f.text}
                    </span>
                  )}
                  <button
                    onClick={() => deleteFact(f.id)}
                    className="opacity-0 group-hover:opacity-100 text-text-lo hover:text-red-core transition-all flex-shrink-0"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}

              {facts.length > 0 && (
                <button
                  onClick={() => { if (confirm('Clear all memory facts?')) clearAllFacts(); }}
                  className="text-xs text-text-lo hover:text-red-core transition-colors"
                >
                  Clear all memory
                </button>
              )}
            </>
          )}

          {tab === 'appearance' && (
            <div className="space-y-5">
              <AppearanceGroup label="Font Size" description="Base size for chat text, labels and input">
                {([['small','Small'], ['medium','Medium'], ['large','Large']] as [FontSize, string][]).map(([v, l]) => (
                  <SegBtn key={v} active={fontSize === v} onClick={() => setFontSize(v)}>{l}</SegBtn>
                ))}
              </AppearanceGroup>
              <AppearanceGroup label="Font Style" description="Applies to chat bubbles only, not UI chrome">
                {([['system','System'], ['serif','Serif'], ['mono','Mono'], ['rounded','Rounded']] as [FontStyle, string][]).map(([v, l]) => (
                  <SegBtn key={v} active={fontStyle === v} onClick={() => setFontStyle(v)}>{l}</SegBtn>
                ))}
              </AppearanceGroup>
              <AppearanceGroup label="Bubble Density" description="Padding inside each chat bubble">
                {([['compact','Compact'], ['comfortable','Comfortable'], ['spacious','Spacious']] as [BubbleDensity, string][]).map(([v, l]) => (
                  <SegBtn key={v} active={bubbleDensity === v} onClick={() => setBubbleDensity(v)}>{l}</SegBtn>
                ))}
              </AppearanceGroup>
              <AppearanceGroup label="Message Width" description="Max width of message bubbles">
                {([['narrow','Narrow'], ['medium','Medium'], ['wide','Wide']] as [MessageWidth, string][]).map(([v, l]) => (
                  <SegBtn key={v} active={messageWidth === v} onClick={() => setMessageWidth(v)}>{l}</SegBtn>
                ))}
              </AppearanceGroup>
              <AppearanceGroup label="Sidebar Width" description="Width of the left conversation panel">
                {([['collapsed','Collapsed'], ['normal','Normal'], ['wide','Wide']] as [SidebarWidth, string][]).map(([v, l]) => (
                  <SegBtn key={v} active={sidebarWidth === v} onClick={() => setSidebarWidth(v)}>{l}</SegBtn>
                ))}
              </AppearanceGroup>
              <AppearanceGroup label="Send Key" description="How to send messages in the chat composer">
                {([['enter','Enter = Send'], ['ctrl-enter','Ctrl+Enter = Send']] as [SendKey, string][]).map(([v, l]) => (
                  <SegBtn key={v} active={sendKey === v} onClick={() => setSendKey(v)}>{l}</SegBtn>
                ))}
              </AppearanceGroup>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-hi font-medium">Notification sound</p>
                  <p className="text-[10px] text-text-lo mt-0.5">Play a subtle ping when AI finishes responding</p>
                </div>
                <button
                  onClick={() => setNotificationSound(!notificationSound)}
                  className={`w-10 h-5 rounded-full relative transition-colors ${notificationSound ? 'bg-red-core' : 'bg-bg-elevated border border-border-hair'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${notificationSound ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
            </div>
          )}

          {tab === 'instructions' && (
            <>
              <div>
                <p className="text-xs text-text-hi font-medium mb-1">Global instructions</p>
                <p className="text-[10px] text-text-lo mb-3">
                  These instructions are prepended to every chat you start, regardless of project.
                </p>
                <textarea
                  value={globalPrompt}
                  onChange={(e) => setGlobalPrompt(e.target.value)}
                  placeholder="e.g. Always respond in a concise, direct manner. Prefer bullet points over paragraphs. Use British English."
                  rows={10}
                  className="w-full bg-bg-elevated border border-border-hair rounded-lg px-3 py-2 text-sm text-text-hi placeholder:text-text-lo focus:outline-none focus:border-red-core/50 resize-none font-mono"
                />
                <p className="text-[10px] text-text-lo mt-1">{globalPrompt.length} chars</p>
              </div>
            </>
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
            onClick={saveProfile}
            className="flex-1 px-4 py-2 rounded-lg bg-red-core text-white text-xs font-semibold hover:bg-red-core/90 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function AppearanceGroup({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-text-hi font-medium mb-0.5">{label}</p>
      <p className="text-[10px] text-text-lo mb-2">{description}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
      style={{
        background: active ? 'linear-gradient(135deg,#FF1F2E,#8E0E16)' : 'var(--bg-elevated)',
        color: active ? '#fff' : 'var(--text-lo)',
        borderColor: active ? 'transparent' : 'var(--border-hair)',
      }}
    >
      {children}
    </button>
  );
}
