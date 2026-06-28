import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary] Caught render error:', error);
  }

  handleClear = () => {
    // Wipe all persisted Zustand stores so corrupt state can't crash again
    const keys = [
      'nano-bricks-run',
      'nano-bricks-history',
      'nano-bricks-session',
      'nano-bricks-theme',
      'nano-bricks-tools',
      'nano-bricks-memory',
      'nano-bricks-projects',
      'nano-bricks-scheduler',
      'nano-bricks-onboarding',
    ];
    keys.forEach((k) => localStorage.removeItem(k));
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-black gap-6 p-8">
        <div className="w-10 h-10 rounded-full border-2 border-red-500 flex items-center justify-center">
          <span className="text-red-500 text-xl font-bold">!</span>
        </div>
        <div className="text-center">
          <h1 className="text-white text-lg font-semibold mb-2">Something went wrong</h1>
          <p className="text-gray-400 text-sm max-w-sm">
            The app ran into an error and couldn't recover. Clearing local data will fix it — your account and cloud history are safe.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm hover:border-gray-500 transition-colors"
          >
            Retry
          </button>
          <button
            onClick={this.handleClear}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
          >
            Clear data &amp; restart
          </button>
        </div>
        <p className="text-gray-600 text-xs font-mono max-w-md text-center break-all">
          {this.state.error.message}
        </p>
      </div>
    );
  }
}
