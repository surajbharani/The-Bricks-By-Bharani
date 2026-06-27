import { useEffect } from 'react';
import { useScheduler } from '../store/useScheduler';
import { useToast } from '../store/useToast';

export function SchedulerTicker() {
  const { tasks, markFired } = useScheduler();
  const { addToast } = useToast();

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      for (const task of tasks) {
        if (task.status === 'pending' && task.dueAt <= now) {
          addToast({ message: `Reminder: ${task.label}`, type: 'info', duration: 0 });
          markFired(task.id);
        }
      }
    };

    check(); // run immediately on mount / task change
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [tasks, markFired, addToast]);

  return null;
}
