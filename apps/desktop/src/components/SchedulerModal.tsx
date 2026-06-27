import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useScheduler, type ScheduledTask } from '../store/useScheduler';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SchedulerModal({ open, onClose }: Props) {
  const { tasks, addTask, removeTask } = useScheduler();
  const [label, setLabel] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [repeat, setRepeat] = useState<'daily' | 'weekly' | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const submit = () => {
    if (!label.trim() || !dateTime) return;
    addTask({ label: label.trim(), dueAt: new Date(dateTime).getTime(), repeat });
    setLabel('');
    setDateTime('');
    setRepeat(null);
  };

  const pending = tasks.filter((t) => t.status === 'pending');
  const done    = tasks.filter((t) => t.status === 'fired');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="scheduler-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-bg-void/80 backdrop-blur-sm flex items-center justify-center"
          onClick={onClose}
        >
          <motion.div
            key="scheduler-panel"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md mx-4 bg-bg-panel border border-border-hair rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-hair">
              <div>
                <h2 className="text-sm font-bold text-text-hi font-display">Scheduled Tasks</h2>
                <p className="text-xs text-text-lo mt-0.5">Set reminders and recurring tasks</p>
              </div>
              <button onClick={onClose} className="text-text-lo hover:text-text-hi transition-colors text-xs">✕</button>
            </div>

            {/* Create form */}
            <div className="p-4 border-b border-border-hair space-y-3">
              <input
                type="text"
                placeholder="Reminder label…"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full bg-bg-elevated border border-border-hair rounded-lg px-3 py-2 text-sm text-text-hi placeholder-text-lo outline-none focus:border-red-core/40"
              />
              <input
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full bg-bg-elevated border border-border-hair rounded-lg px-3 py-2 text-sm text-text-hi outline-none focus:border-red-core/40"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-lo">Repeat:</span>
                {(['daily', 'weekly', null] as const).map((r) => (
                  <button
                    key={String(r)}
                    onClick={() => setRepeat(r)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      repeat === r
                        ? 'border-red-core text-red-core bg-red-core/10'
                        : 'border-border-hair text-text-lo hover:text-text-hi'
                    }`}
                  >
                    {r === null ? 'Once' : r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
                <button
                  onClick={submit}
                  disabled={!label.trim() || !dateTime}
                  className="ml-auto px-4 py-1.5 text-xs font-semibold bg-red-core text-white rounded-lg hover:bg-red-core/90 transition-colors disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Task list */}
            <div className="p-4 max-h-64 overflow-y-auto space-y-2">
              {pending.length === 0 && done.length === 0 && (
                <p className="text-xs text-text-lo text-center py-4">No scheduled tasks yet</p>
              )}
              {pending.map((t) => <TaskRow key={t.id} task={t} onRemove={removeTask} />)}
              {done.map((t) => <TaskRow key={t.id} task={t} onRemove={removeTask} muted />)}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TaskRow({ task, onRemove, muted }: { task: ScheduledTask; onRemove: (id: string) => void; muted?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-elevated border border-border-hair ${muted ? 'opacity-40' : ''}`}>
      <span className="text-sm">{muted ? '✓' : '🕐'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-hi truncate">{task.label}</p>
        <p className="text-[10px] text-text-lo">
          {new Date(task.dueAt).toLocaleString()}
          {task.repeat && ` · ${task.repeat}`}
        </p>
      </div>
      <button
        onClick={() => onRemove(task.id)}
        className="text-text-lo hover:text-red-core transition-colors text-xs"
        aria-label="Delete task"
      >
        ✕
      </button>
    </div>
  );
}
