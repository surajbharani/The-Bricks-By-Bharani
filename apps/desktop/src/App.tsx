import { useEffect, useState } from 'react';
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
import { ThemeToggle } from './components/ThemeToggle';
import { ToastContainer } from './components/ToastContainer';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { OnboardingFlow } from './components/OnboardingFlow';
import { useAuth } from './store/useAuth';
import { useSession } from './store/useSession';
import { useRun } from './store/useRun';
import { useProjects } from './store/useProjects';
import { useTheme } from './store/useTheme';
import { useOnboarding } from './store/useOnboarding';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { supabase } from './lib/supabase';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function App() {
  const { session, loading } = useAuth();
  const { mode, showCanvas, setShowCanvas, newConversation } = useSession();
  const { resetRun } = useRun();
  const { projects, activeProjectId } = useProjects();
  const { theme, fontSize, fontStyle, bubbleDensity, messageWidth } = useTheme();
  const { completed } = useOnboarding();
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  const [showShortcuts, setShowShortcuts] = useState(false);

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Apply appearance CSS variables
  useEffect(() => {
    const root = document.documentElement;
    const sizeMap = { small: '12px', medium: '14px', large: '16px' };
    const familyMap = {
      system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      serif:  "Georgia, 'Times New Roman', serif",
      mono:   "'JetBrains Mono', Menlo, Consolas, monospace",
      rounded: "'Nunito', 'Varela Round', sans-serif",
    };
    const pxMap = { compact: '0.75rem', comfortable: '1rem', spacious: '1.25rem' };
    const pyMap = { compact: '0.5rem',  comfortable: '0.75rem', spacious: '1rem' };
    const mwMap = { narrow: '60%', medium: '75%', wide: '90%' };

    root.style.setProperty('--chat-font-size',   sizeMap[fontSize]);
    root.style.setProperty('--chat-font-family', familyMap[fontStyle]);
    root.style.setProperty('--bubble-px',        pxMap[bubbleDensity]);
    root.style.setProperty('--bubble-py',        pyMap[bubbleDensity]);
    root.style.setProperty('--msg-max-w',        mwMap[messageWidth]);
  }, [fontSize, fontStyle, bubbleDensity, messageWidth]);

  // Handle confirmation deep-link: nano-bricks://auth/callback#access_token=...
  useEffect(() => {
    if (!IS_TAURI) return;
    let cleanup: (() => void) | undefined;
    listen<string>('auth-deep-link', (event) => {
      const raw = event.payload;
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
      const qIdx = raw.indexOf('?');
      if (qIdx !== -1) {
        const params = new URLSearchParams(raw.slice(qIdx + 1));
        const code = params.get('code');
        if (code) supabase.auth.exchangeCodeForSession(code);
      }
    }).then((unlisten) => { cleanup = unlisten; });
    return () => cleanup?.();
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    if (!session) return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        newConversation();
      } else if (e.key === ',' ) {
        e.preventDefault();
        // Open settings — dispatch a custom event that SettingsModal listens to
        window.dispatchEvent(new CustomEvent('open-settings'));
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('focus-composer'));
      } else if ((e.key === 'c' || e.key === 'C') && e.shiftKey) {
        e.preventDefault();
        setShowCanvas(!showCanvas);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [session, showCanvas, setShowCanvas, newConversation]);

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

  // Onboarding wizard — shown once after first login
  if (!completed) {
    return <OnboardingFlow />;
  }

  const handleStop = () => {
    if (IS_TAURI) invoke('agent_stop').catch(() => {});
    resetRun();
  };

  const isAgent = mode === 'agent';

  return (
    <>
      <div className="dot-grid flex h-screen w-screen overflow-hidden bg-bg-void">
        <Sidebar onOpenShortcuts={() => setShowShortcuts(true)} />

        <div className="flex flex-col flex-1 min-w-0 h-full">
          {/* Top bar */}
          <header className="flex items-center justify-between px-4 py-3 border-b border-border-hair bg-bg-void/80 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-2">
              <ModeToggle />
              <SwarmToggle />
              {activeProject && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-core/10 border border-red-core/20 text-[10px] text-red-core font-medium">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  {activeProject.name}
                </span>
              )}
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
              <ThemeToggle />
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

      {/* Global overlays */}
      <ToastContainer />
      <KeyboardShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </>
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
