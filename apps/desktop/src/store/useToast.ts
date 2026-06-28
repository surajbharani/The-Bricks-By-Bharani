import { create } from 'zustand';
import { uuid } from '../lib/uuid';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  /** ms before auto-dismiss; 0 = never auto-dismiss */
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToast = create<ToastState>()((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = uuid();
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...toast, id }] }));
    return id;
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  clearToasts: () => set({ toasts: [] }),
}));
