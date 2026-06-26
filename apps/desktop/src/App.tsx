import { Sidebar } from './components/Sidebar';
import { ModeToggle } from './components/ModeToggle';
import { SwarmToggle } from './components/SwarmToggle';
import { ModelDropdown } from './components/ModelDropdown';
import { ChatStream } from './components/ChatStream';
import { Composer } from './components/Composer';

function App() {
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
          <ModelDropdown />
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
