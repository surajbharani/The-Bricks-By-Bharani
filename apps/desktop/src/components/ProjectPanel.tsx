import { useState } from 'react';
import { useProjects } from '../store/useProjects';
import { useSession } from '../store/useSession';
import { ProjectModal } from './ProjectModal';

export function ProjectPanel() {
  const { projects, activeProjectId, setActiveProject, deleteProject } = useProjects();
  const { newConversation } = useSession();
  const [showModal, setShowModal] = useState(false);
  // Store only the id so the modal always receives a live project object from the store
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const editingProject = editingProjectId ? (projects.find((p) => p.id === editingProjectId) ?? null) : null;

  const activate = (id: string | null) => {
    setActiveProject(id);
    newConversation();
  };

  return (
    <>
      <div className="px-2 pt-3 pb-1 flex items-center justify-between">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-text-lo opacity-60">
          Projects
        </p>
        <button
          onClick={() => { setEditingProjectId(null); setShowModal(true); }}
          title="New project"
          className="text-text-lo hover:text-red-core transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* No project (global) */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${
          activeProjectId === null
            ? 'bg-red-core/10 border border-red-core/20 text-text-hi'
            : 'text-text-lo hover:bg-bg-elevated border border-transparent'
        }`}
        onClick={() => activate(null)}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4l3 3" />
        </svg>
        <span className="truncate">Global (no project)</span>
      </div>

      {projects.map((p) => {
        const isActive = p.id === activeProjectId;
        return (
          <div
            key={p.id}
            className={`group relative flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors border ${
              isActive ? 'bg-red-core/10 border-red-core/20' : 'hover:bg-bg-elevated border-transparent'
            }`}
            onClick={() => activate(p.id)}
          >
            <FolderIcon active={isActive} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs truncate leading-snug ${isActive ? 'text-text-hi' : 'text-text-lo'}`}>
                {p.name}
              </p>
              {p.description && (
                <p className="text-[9px] text-text-lo truncate">{p.description}</p>
              )}
            </div>
            <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setEditingProjectId(p.id); setShowModal(true); }}
                title="Edit project"
                className="text-text-lo hover:text-text-hi transition-colors p-0.5"
              >
                <EditIcon />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                title="Delete project"
                className="text-text-lo hover:text-red-core transition-colors p-0.5"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        );
      })}

      {showModal && (
        <ProjectModal
          project={editingProject}
          onClose={() => { setShowModal(false); setEditingProjectId(null); }}
        />
      )}
    </>
  );
}

function FolderIcon({ active }: { active: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke={active ? '#FF1F2E' : 'currentColor'} strokeWidth="2" strokeLinecap="round"
      className="flex-shrink-0 mt-0.5">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
