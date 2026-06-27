import React, { useState, useRef, useEffect } from 'react';
import { useSession } from '../store/useSession';
import { useHistory, type Conversation } from '../store/useHistory';
import { useAuth } from '../store/useAuth';
import { useMemory } from '../store/useMemory';
import { ProjectPanel } from './ProjectPanel';
import { SettingsModal } from './SettingsModal';

interface SidebarProps {
  onOpenShortcuts?: () => void;
}

export function Sidebar({ onOpenShortcuts }: SidebarProps = {}) {
  const { conversationId, newConversation, loadConversation } = useSession();
  const { conversations, agentRuns, deleteConversation, deleteAgentRun, updateConversationMeta } = useHistory();
  const { user, signOut } = useAuth();
  const { settings } = useMemory();
  const [showSettings, setShowSettings] = useState(false);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [folderOpen, setFolderOpen] = useState<Record<string, boolean>>({});
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Listen for open-settings event from global keyboard shortcut (Ctrl+,)
  useEffect(() => {
    const handler = () => setShowSettings(true);
    window.addEventListener('open-settings', handler);
    return () => window.removeEventListener('open-settings', handler);
  }, []);

  // Close folder menu on outside click
  React.useEffect(() => {
    if (!folderMenuId) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-folder-menu]')) {
        setFolderMenuId(null);
        setNewFolderName('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [folderMenuId]);

  const sortedRuns = [...agentRuns].sort((a, b) => b.createdAt - a.createdAt);

  const q = search.toLowerCase().trim();
  const allConvs = [...conversations].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  const activeConvs = allConvs.filter((c) => !c.archived && (!q || c.title.toLowerCase().includes(q)));
  const archivedConvs = allConvs.filter((c) => c.archived && (!q || c.title.toLowerCase().includes(q)));

  // Group by folder
  const folders = Array.from(new Set(activeConvs.filter((c) => c.folder).map((c) => c.folder!)));
  const ungrouped = activeConvs.filter((c) => !c.folder);

  const displayName = settings.displayName;
  const avatarLabel = (displayName || user?.email || '?')[0]?.toUpperCase() ?? '?';

  const existingFolders = Array.from(new Set(conversations.filter((c) => c.folder).map((c) => c.folder!)));

  const startRename = (conv: Conversation) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title);
    setTimeout(() => renameInputRef.current?.focus(), 30);
  };

  const commitRename = (id: string) => {
    const v = renameValue.trim();
    if (v) updateConversationMeta(id, { title: v });
    setRenamingId(null);
  };

  const assignFolder = (id: string, folder: string | undefined) => {
    updateConversationMeta(id, { folder });
    setFolderMenuId(null);
    setNewFolderName('');
  };

  const renderConv = (conv: Conversation) => {
    const isActive = conv.id === conversationId;
    const isRenaming = renamingId === conv.id;

    return (
      <div
        key={conv.id}
        className={`group relative flex items-start gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isActive ? 'bg-red-core/10 border border-red-core/20' : 'hover:bg-bg-elevated border border-transparent'
        }`}
        onClick={() => !isRenaming && loadConversation(conv.id)}
        onDoubleClick={(e) => { e.preventDefault(); startRename(conv); }}
      >
        {conv.pinned && (
          <span className="absolute top-1 right-1 text-[8px] text-red-core opacity-60">📌</span>
        )}
        <ChatIcon />
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => commitRename(conv.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(conv.id);
                if (e.key === 'Escape') setRenamingId(null);
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-bg-panel border border-red-core/40 rounded px-1 text-xs text-text-hi outline-none"
            />
          ) : (
            <>
              <p className={`text-xs truncate leading-snug ${isActive ? 'text-text-hi' : 'text-text-lo'}`}>{conv.title}</p>
              <p className="text-[9px] text-text-lo mt-0.5">{relativeTime(conv.updatedAt)}</p>
            </>
          )}
        </div>

        {/* Hover action buttons */}
        <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 flex-shrink-0 items-center">
          {/* Pin */}
          <ActionBtn title={conv.pinned ? 'Unpin' : 'Pin'} onClick={(e) => { e.stopPropagation(); updateConversationMeta(conv.id, { pinned: !conv.pinned }); }}>
            <PinIcon pinned={!!conv.pinned} />
          </ActionBtn>
          {/* Archive */}
          <ActionBtn title={conv.archived ? 'Unarchive' : 'Archive'} onClick={(e) => { e.stopPropagation(); updateConversationMeta(conv.id, { archived: !conv.archived }); }}>
            <ArchiveIcon />
          </ActionBtn>
          {/* Folder */}
          <div className="relative" data-folder-menu>
            <ActionBtn title="Move to folder" onClick={(e) => { e.stopPropagation(); setFolderMenuId(folderMenuId === conv.id ? null : conv.id); }}>
              <FolderBtnIcon />
            </ActionBtn>
            {folderMenuId === conv.id && (
              <div
                data-folder-menu
                className="absolute right-0 top-full mt-1 bg-bg-panel border border-border-hair rounded-xl shadow-xl z-30 min-w-[130px] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {existingFolders.map((f) => (
                  <button key={f} onClick={() => assignFolder(conv.id, f)}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-text-lo hover:bg-bg-elevated hover:text-text-hi transition-colors">
                    {f}
                  </button>
                ))}
                {conv.folder && (
                  <button onClick={() => assignFolder(conv.id, undefined)}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-text-lo hover:bg-bg-elevated hover:text-red-core transition-colors border-t border-border-hair">
                    Remove from folder
                  </button>
                )}
                <div className="flex gap-1 px-2 py-1.5 border-t border-border-hair">
                  <input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="New folder…"
                    className="flex-1 bg-bg-elevated text-[11px] text-text-hi rounded px-1.5 py-0.5 outline-none border border-border-hair"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newFolderName.trim()) assignFolder(conv.id, newFolderName.trim());
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          {/* Delete */}
          <ActionBtn title="Delete" onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}>
            <TrashIcon />
          </ActionBtn>
        </div>
      </div>
    );
  };

  return (
    <aside className="w-56 flex-shrink-0 bg-bg-panel border-r border-border-hair flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border-hair">
        <div className="flex items-center gap-2">
          <NanoBricksLogo />
          <div>
            <p className="text-xs font-bold text-text-hi font-display tracking-wide">Nano Bricks</p>
            <p className="text-[10px] text-text-lo">by Bharani</p>
          </div>
        </div>
      </div>

      {/* New chat + Search */}
      <div className="px-3 py-2 border-b border-border-hair space-y-1.5">
        <button
          onClick={newConversation}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-text-lo hover:text-text-hi hover:bg-bg-elevated transition-colors duration-150"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          New conversation
        </button>
        <div className="relative">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-lo pointer-events-none">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats…"
            className="w-full bg-bg-elevated border border-border-hair rounded-lg pl-7 pr-2 py-1.5 text-xs text-text-hi placeholder-text-lo outline-none focus:border-red-core/40 transition-colors"
          />
        </div>
      </div>

      {/* Scrollable history */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {/* Projects section */}
        <ProjectPanel />

        <div className="mt-2 mb-1 h-px bg-border-hair opacity-50" />

        {/* Folder groups */}
        {folders.map((folder) => {
          const folderConvs = activeConvs.filter((c) => c.folder === folder);
          const isOpen = folderOpen[folder] !== false;
          return (
            <div key={folder}>
              <button
                onClick={() => setFolderOpen((prev) => ({ ...prev, [folder]: !isOpen }))}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-lo hover:text-text-hi transition-colors"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor"
                  style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                  <path d="M3 1.5l3 3-3 3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
                </svg>
                <FolderBtnIcon />
                <span className="truncate">{folder}</span>
                <span className="ml-auto text-[9px] opacity-50">{folderConvs.length}</span>
              </button>
              {isOpen && <div className="ml-2 space-y-0.5">{folderConvs.map(renderConv)}</div>}
            </div>
          );
        })}

        {/* Ungrouped chats */}
        {ungrouped.length > 0 && (
          <>
            {folders.length > 0 && (
              <p className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-text-lo opacity-60">
                Chats
              </p>
            )}
            <div className="space-y-0.5">{ungrouped.map(renderConv)}</div>
          </>
        )}

        {activeConvs.length === 0 && !search && (
          <p className="text-xs text-text-lo px-2 py-4 text-center opacity-50">No history yet</p>
        )}
        {activeConvs.length === 0 && search && (
          <p className="text-xs text-text-lo px-2 py-4 text-center opacity-50">No matches</p>
        )}

        {/* Archived section */}
        {archivedConvs.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-text-lo hover:text-text-hi transition-colors"
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none"
                style={{ transform: showArchived ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                <path d="M3 1.5l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              Archived ({archivedConvs.length})
            </button>
            {showArchived && <div className="ml-2 space-y-0.5">{archivedConvs.map(renderConv)}</div>}
          </div>
        )}

        {/* Agent runs */}
        {sortedRuns.length > 0 && (
          <>
            <p className="px-2 pt-3 pb-1 text-[9px] font-semibold uppercase tracking-widest text-text-lo opacity-60">
              Agent runs
            </p>
            {sortedRuns.map((run) => (
              <div
                key={run.id}
                className="group relative flex items-start gap-1.5 px-2.5 py-2 rounded-lg border border-transparent hover:bg-bg-elevated transition-colors"
              >
                <AgentIcon ok={run.status === 'done'} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-hi truncate leading-snug">{run.query}</p>
                  {run.summary && (
                    <p className="text-[9px] text-text-lo truncate mt-0.5">{run.summary}</p>
                  )}
                  <p className="text-[9px] text-text-lo mt-0.5">
                    {relativeTime(run.createdAt)} · {run.tokensUsed.toLocaleString()} tokens
                  </p>
                </div>
                <ActionBtn title="Delete" onClick={(e) => { e.stopPropagation(); deleteAgentRun(run.id); }}>
                  <TrashIcon />
                </ActionBtn>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border-hair">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg group">
          <div className="w-6 h-6 rounded-full bg-bg-elevated border border-border-hair flex items-center justify-center text-[10px] text-text-hi font-bold flex-shrink-0">
            {avatarLabel}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-hi truncate">{displayName || user?.email || 'Not signed in'}</p>
          </div>
          {onOpenShortcuts && (
            <button
              onClick={onOpenShortcuts}
              title="Keyboard shortcuts (Ctrl+K)"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-text-lo hover:text-text-hi mr-1"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-text-lo hover:text-text-hi mr-1"
          >
            <GearIcon />
          </button>
          <button
            onClick={signOut}
            title="Sign out"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-text-lo hover:text-red-core"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M5 2H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h3M8 9l3-3-3-3M11 6H5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </aside>
  );
}

// ── Small action button ───────────────────────────────────────────────────────
function ActionBtn({ children, onClick, title }: { children: React.ReactNode; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-5 h-5 flex items-center justify-center rounded text-text-lo hover:text-red-core transition-colors flex-shrink-0"
    >
      {children}
    </button>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000)    return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function NanoBricksLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="9" height="9" rx="2" fill="#FF1F2E" />
      <rect x="13" y="2" width="9" height="9" rx="2" fill="#FF1F2E" opacity="0.6" />
      <rect x="2" y="13" width="9" height="9" rx="2" fill="#FF1F2E" opacity="0.6" />
      <rect x="13" y="13" width="9" height="9" rx="2" fill="#FF1F2E" opacity="0.3" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" className="text-text-lo flex-shrink-0 mt-0.5">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function AgentIcon({ ok }: { ok: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke={ok ? '#28C76F' : '#FF1F2E'} strokeWidth="2" strokeLinecap="round"
      className="flex-shrink-0 mt-0.5">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function PinIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill={pinned ? '#FF1F2E' : 'none'}
      stroke={pinned ? '#FF1F2E' : 'currentColor'} strokeWidth="2" strokeLinecap="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function FolderBtnIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
