import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uuid } from '../lib/uuid';
import { deviceStorage } from '../lib/storage';

export interface ProjectFile {
  id: string;
  name: string;
  text: string;
  addedAt: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  memory: string;
  files: ProjectFile[];
  createdAt: number;
  updatedAt: number;
}

interface ProjectsState {
  projects: Project[];
  activeProjectId: string | null;

  createProject: (name: string) => string;
  updateProject: (id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  addProjectFile: (projectId: string, file: ProjectFile) => void;
  removeProjectFile: (projectId: string, fileId: string) => void;
}

export const useProjects = create<ProjectsState>()(
  persist(
    (set) => ({
      projects: [],
      activeProjectId: null,

      createProject: (name) => {
        const id = uuid();
        const now = Date.now();
        set((s) => ({
          projects: [
            { id, name, description: '', systemPrompt: '', memory: '', files: [], createdAt: now, updatedAt: now },
            ...s.projects,
          ],
        }));
        return id;
      },

      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
          ),
        })),

      deleteProject: (id) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
        })),

      setActiveProject: (id) => set({ activeProjectId: id }),

      addProjectFile: (projectId, file) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? { ...p, files: [...p.files, file], updatedAt: Date.now() }
              : p
          ),
        })),

      removeProjectFile: (projectId, fileId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? { ...p, files: p.files.filter((f) => f.id !== fileId), updatedAt: Date.now() }
              : p
          ),
        })),
    }),
    {
      name: 'nano-bricks-projects',
      storage: deviceStorage,
      partialize: (s) => ({
        projects: (s.projects ?? []).map((p) => ({
          ...p,
          files: (p.files ?? []).map((f) => ({ ...f, text: (f.text ?? '').slice(0, 500) })),
        })),
        activeProjectId: s.activeProjectId,
      }),
    }
  )
);
