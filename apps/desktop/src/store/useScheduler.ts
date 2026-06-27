import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ScheduledTask {
  id: string;
  label: string;
  dueAt: number;
  repeat: 'daily' | 'weekly' | null;
  status: 'pending' | 'fired';
}

interface SchedulerState {
  tasks: ScheduledTask[];
  addTask: (task: Omit<ScheduledTask, 'id' | 'status'>) => void;
  removeTask: (id: string) => void;
  markFired: (id: string) => void;
}

export const useScheduler = create<SchedulerState>()(
  persist(
    (set) => ({
      tasks: [],
      addTask: (task) =>
        set((s) => ({
          tasks: [...s.tasks, { ...task, id: crypto.randomUUID(), status: 'pending' }],
        })),
      removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      markFired: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== id) return t;
            if (t.repeat === 'daily')  return { ...t, dueAt: t.dueAt + 86_400_000, status: 'pending' };
            if (t.repeat === 'weekly') return { ...t, dueAt: t.dueAt + 604_800_000, status: 'pending' };
            return { ...t, status: 'fired' };
          }),
        })),
    }),
    { name: 'nano-bricks-scheduler' }
  )
);
