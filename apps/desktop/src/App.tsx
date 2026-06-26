import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ModeToggle } from './components/ModeToggle';
import { SwarmToggle } from './components/SwarmToggle';
import { ModelDropdown } from './components/ModelDropdown';
import { ChatStream } from './components/ChatStream';
import { Composer } from './components/Composer';
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
  const { mode } = useSession();
  const { resetRun } = useRun();

  // Handle magic-link deep-link: nano-bricks://auth/callback#access_token=...
  useEffect(() => {
    if (!IS_TAURI) return;
    let cleanup: (() => void) | undefined;
    listen<string>('auth-deep-link', (event) => {
      const raw = event.payload;
      const hashIdx = raw.indexOf('#');
      if (hashIdx === -1) return;
      const params = new URLSearchParams(raw.slice(hashIdx + 1));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        supabase.auth.setSession({ access_token, refresh_token });
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
            <UsageMeter />
            <ModelDropdown />
          </div>
        </header>

        {/* Agent mode: timeline dashboard */}
        {isAgent ? (
          <main className="flex flex-col flex-1 min-h-0">
            <RunHeader onStop={handleStop} />
            <RunView />
            <AgentComposer />
          </main>
        ) : (
          /* Chat mode */
          <main className="flex flex-col flex-1 min-h-0">
            <ChatStream />
            <Composer />
          </main>
        )}
      </div>
    </div>
  );
}

export default App;
