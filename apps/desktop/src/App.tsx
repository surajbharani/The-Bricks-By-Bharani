import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ModeToggle } from './components/ModeToggle';
import { SwarmToggle } from './components/SwarmToggle';
import { ModelDropdown } from './components/ModelDropdown';
import { ThinkingToggle } from './components/ThinkingToggle';
import { ChatStream } from './components/ChatStream';
import { Composer } from './components/Composer';
import { Canvas } from './components/Canvas';
import { RunView } from './components/RunView';
import { RunHeader } from './components/RunHeader';
import { AgentComposer } from './components/AgentComposer';
import { AuthGate } from './components/AuthGate';
import { UsageMeter } from './components/UsageMeter';
import { useAuth } from './store/useAuth';
import { useSession } from './store/useSession';
import { useRun } from './store/useRun';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { supabase } from './lib/supabase';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function App() {
  const { session, loading } = useAuth();
  const { mode, showCanvas, setShowCanvas } = useSession();
  const { resetRun } = useRun();

  // Handle confirmation deep-link: nano-bricks://auth/callback#access_token=...
  // Tauri emits 'auth-deep-link' from lib.rs when the scheme is triggered
  useEffect(() => {
    if (!IS_TAURI) return;
    let cleanup: (() => void) | undefined;
    listen<string>('auth-deep-link', (event) => {
      const raw = event.payload;
      // Fragment-based token (magic link / email confirm)
      const hashIdx = raw.indexOf('#');
      if (hashIdx !== -1) {
        const params = new URLSearchParams(raw.slice(hashIdx + 1));
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          supabase.auth.setSession({ access_token, refresh_token });
          return;
        }
      }
      // Query-param based token (PKCE flow)
      const qIdx = raw.indexOf('?');
      if (qIdx !== -1) {
        const params = new URLSearchParams(raw.slice(qIdx + 1));
        const code = params.get('code');
        if (code) {
          supabase.auth.exchangeCodeForSession(code);
        }
      }
    }).then((unlisten) => { cleanup = unlisten; });
    return () => cleanup?.();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-void">
        <div className="w-2 h-2 rounded-full bg-red-core animate-pulse" />
      </div>
    );
  }

  if (!session) {
    return <AuthGate />;
  }

  const handleStop = () => {
    if (IS_TAURI) invoke('agent_stop').catch(() => {});
    resetRun();
  };

  const isAgent = mode === 'agent';

  return (
    <div className="dot-grid flex h-screen w-screen overflow-hidden bg-bg-void">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border-hair bg-bg-void/80 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-2">
            <ModeToggle />
            <SwarmToggle />
          </div>
          <div className="flex items-center gap-2">
            {!isAgent && <ThinkingToggle />}
            {!isAgent && (
              <button
                onClick={() => setShowCanvas(!showCanvas)}
                title={showCanvas ? 'Close Canvas' : 'Open Canvas editor'}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  showCanvas
                    ? 'bg-red-core/15 border-red-core/40 text-red-core'
                    : 'bg-bg-panel border-border-hair text-text-lo hover:text-text-hi hover:border-red-core/30'
                }`}
              >
                <CanvasIcon active={showCanvas} />
                Canvas
              </button>
            )}
            <UsageMeter />
            <ModelDropdown />
          </div>
        </header>

        {isAgent ? (
          <main className="flex flex-col flex-1 min-h-0">
            <RunHeader onStop={handleStop} />
            <RunView />
            <AgentComposer />
          </main>
        ) : showCanvas ? (
          <main className="flex flex-col flex-1 min-h-0">
            <Canvas />
          </main>
        ) : (
          <main className="flex flex-col flex-1 min-h-0">
            <ChatStream />
            <Composer />
          </main>
        )}
      </div>
    </div>
  );
}

function CanvasIcon({ active }: { active: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke={active ? '#FF1F2E' : 'currentColor'} strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  );
}

export default App;
