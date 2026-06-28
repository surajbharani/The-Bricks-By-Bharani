import { Component, type ReactNode } from 'react';

// Volatile stores that are safe to wipe as a last resort. Deliberately EXCLUDES
// 'nano-bricks-onboarding' (welcome tour), 'nano-bricks-dev' (dev login) and
// 'nano-bricks-auth' (Supabase session) so recovery never re-shows the welcome
// popup or logs the user out.
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

function clearVolatileStores() {
  STORE_KEYS.forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  });
}

function getAttempt(): number {
  try { return Number(sessionStorage.getItem('nb-recovery') || '0'); } catch { return 0; }
}
function setAttempt(n: number) {
  try { sessionStorage.setItem('nb-recovery', String(n)); } catch { /* ignore */ }
}
function clearAttempt() {
  try { sessionStorage.removeItem('nb-recovery'); } catch { /* ignore */ }
}

interface Props { children: ReactNode }
interface State { error: Error | null; giveUp: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, giveUp: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidMount() {
    // App rendered cleanly. Once it's been stable for a few seconds, reset the
    // recovery counter so a future, unrelated crash starts its own fresh cycle.
    if (!this.state.error) {
      setTimeout(clearAttempt, 4000);
    }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary] Render crash:', error);
    const attempt = getAttempt();

    if (attempt === 0) {
      // 1st crash → reload WITHOUT touching any stored data. Most crashes (e.g.
      // the transient one during the agent-done transition) clear on reload
      // because the run status resets to idle and the finished run is already
      // saved. This preserves Agent mode, history, login — everything.
      setAttempt(1);
      this.reloadSoon();
    } else if (attempt === 1) {
      // Clean reload didn't help → persisted state is likely corrupt. Wipe the
      // volatile stores (login/onboarding kept) and reload.
      clearVolatileStores();
      setAttempt(2);
      this.reloadSoon();
    } else {
      // Two auto-attempts failed → stop reloading (avoid a loop) and let the
      // user decide.
      this.setState({ giveUp: true });
    }
  }

  reloadSoon() {
    setTimeout(() => window.location.reload(), 600);
  }

  handleManualClear = () => {
    clearVolatileStores();
    clearAttempt();
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const wrap: React.CSSProperties = {
      display: 'flex', height: '100vh', width: '100vw', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: '#000', gap: 16,
      fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center',
    };

    if (this.state.giveUp) {
      return (
        <div style={wrap}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid #ef4444',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#ef4444', fontSize: 18, fontWeight: 700 }}>!</span>
          </div>
          <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>
            Nano Bricks needs a reset
          </p>
          <p style={{ color: '#9ca3af', fontSize: 13, margin: 0, maxWidth: 360 }}>
            Clearing temporary data will fix it. Your account and the welcome tour are kept.
          </p>
          <button
            onClick={this.handleManualClear}
            style={{ padding: '8px 16px', borderRadius: 8, background: '#dc2626', color: '#fff',
              fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            Clear data &amp; restart
          </button>
        </div>
      );
    }

    return (
      <div style={wrap}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid #ef4444',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#ef4444', fontSize: 18, fontWeight: 700 }}>!</span>
        </div>
        <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>
          Restarting Nano Bricks…
        </p>
        <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>One moment.</p>
      </div>
    );
  }
}
