import { Sidebar } from './components/Sidebar';
import { ModeToggle } from './components/ModeToggle';
import { SwarmToggle } from './components/SwarmToggle';
import { ModelDropdown } from './components/ModelDropdown';
import { ChatStream } from './components/ChatStream';
import { Composer } from './components/Composer';
import { AuthGate } from './components/AuthGate';
import { UsageMeter } from './components/UsageMeter';
import { useAuth } from './store/useAuth';

function App() {
  const { session, loading } = useAuth();

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

        {/* Chat area */}
        <main className="flex flex-col flex-1 min-h-0">
          <ChatStream />
          <Composer />
        </main>
      </div>
    </div>
  );
}

export default App;
