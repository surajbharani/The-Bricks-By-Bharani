import { Component, type ReactNode } from 'react';

// NOTE: deliberately excludes 'nano-bricks-onboarding' (welcome tour) and
// 'nano-bricks-dev' (dev login) and 'nano-bricks-auth' (Supabase session) so a
// crash never re-shows the welcome popup or logs the user out.
const STORE_KEYS = [
  'nano-bricks-run',
  'nano-bricks-history',
  'nano-bricks-session',
  'nano-bricks-theme',
  'nano-bricks-tools',
  'nano-bricks-memory',
  'nano-bricks-projects',
  'nano-bricks-scheduler',
];

function clearAllStores() {
  STORE_KEYS.forEach((k) => localStorage.removeItem(k));
}

interface Props { children: ReactNode }
interface State { error: Error | null; cleared: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, cleared: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary] Render crash — auto-clearing stores:', error);
    // Auto-clear corrupt data immediately, then auto-reload after 1.5s
    clearAllStores();
    setTimeout(() => window.location.reload(), 1500);
    this.setState({ cleared: true });
  }

  render() {
    if (!this.state.error) return this.props.children;

    // Show a brief "restarting" screen — auto-reloads in 1.5s, no action needed
    return (
      <div style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        gap: '16px',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '2px solid #ef4444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{ color: '#ef4444', fontSize: 18, fontWeight: 700 }}>!</span>
        </div>
        <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>
          Restarting Nano Bricks…
        </p>
        <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
          Clearing temporary data and reloading.
        </p>
      </div>
    );
  }
}
