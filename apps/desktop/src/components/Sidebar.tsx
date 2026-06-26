import { useSession } from '../store/useSession';

export function Sidebar() {
  const { messages, clearMessages } = useSession();

  const sessions = messages.length > 0 ? [{ id: 'current', label: 'Current session' }] : [];

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
          onClick={clearMessages}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-lo hover:text-text-hi hover:bg-bg-elevated transition-colors duration-150"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          New conversation
        </button>
      </div>

      {/* Sessions */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {sessions.length === 0 ? (
          <p className="text-xs text-text-lo px-2 py-4 text-center opacity-50">No conversations yet</p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className="px-3 py-2 rounded-lg text-xs text-text-hi bg-bg-elevated border border-red-core/20 mb-1"
            >
              {s.label}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border-hair">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-elevated transition-colors cursor-pointer">
          <div className="w-6 h-6 rounded-full bg-bg-elevated border border-border-hair flex items-center justify-center text-[10px] text-text-lo">
            ?
          </div>
          <div>
            <p className="text-xs text-text-lo">Not signed in</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

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
