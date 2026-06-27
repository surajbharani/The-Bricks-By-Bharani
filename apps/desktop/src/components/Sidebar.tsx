import { useSession } from '../store/useSession';
import { useHistory } from '../store/useHistory';
import { useAuth } from '../store/useAuth';

export function Sidebar() {
  const { conversationId, newConversation, loadConversation } = useSession();
  const { conversations, agentRuns, deleteConversation, deleteAgentRun } = useHistory();
  const { user, signOut } = useAuth();

  // Sort conversations newest first
  const sortedConvs = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  const sortedRuns  = [...agentRuns].sort((a, b) => b.createdAt - a.createdAt);

  const hasHistory = sortedConvs.length > 0 || sortedRuns.length > 0;

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

      {/* New chat */}
      <div className="px-3 py-3 border-b border-border-hair">
        <button
          onClick={newConversation}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-lo hover:text-text-hi hover:bg-bg-elevated transition-colors duration-150"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          New conversation
        </button>
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {!hasHistory && (
          <p className="text-xs text-text-lo px-2 py-6 text-center opacity-50">
            No history yet
          </p>
        )}

        {/* Chat conversations */}
        {sortedConvs.length > 0 && (
          <>
            <p className="px-2 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-widest text-text-lo opacity-60">
              Chats
            </p>
            {sortedConvs.map((conv) => {
              const isActive = conv.id === conversationId;
              return (
                <div
                  key={conv.id}
                  className={`group relative flex items-start gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-red-core/10 border border-red-core/20'
                      : 'hover:bg-bg-elevated border border-transparent'
                  }`}
                  onClick={() => loadConversation(conv.id)}
                >
                  <ChatIcon />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-hi truncate leading-snug">{conv.title}</p>
                    <p className="text-[9px] text-text-lo mt-0.5">
                      {relativeTime(conv.updatedAt)} · {conv.messages.filter(m => m.role === 'user').length} msgs
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                    title="Delete"
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-text-lo hover:text-red-core transition-all mt-0.5"
                  >
                    <TrashIcon />
                  </button>
                </div>
              );
            })}
          </>
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
                <button
                  onClick={() => deleteAgentRun(run.id)}
                  title="Delete"
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-text-lo hover:text-red-core transition-all mt-0.5"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border-hair">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg group">
          <div className="w-6 h-6 rounded-full bg-bg-elevated border border-border-hair flex items-center justify-center text-[10px] text-text-hi font-bold flex-shrink-0">
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-hi truncate">{user?.email ?? 'Not signed in'}</p>
          </div>
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
    </aside>
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
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
