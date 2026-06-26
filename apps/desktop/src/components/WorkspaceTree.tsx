import { motion, AnimatePresence } from 'framer-motion';
import type { FileActivity } from '../store/useRun';

interface Props {
  files: FileActivity[];
}

const ACTION_ICON: Record<FileActivity['action'], string> = {
  write: '+ ',
  edit: '~ ',
};

const ACTION_COLOR: Record<FileActivity['action'], string> = {
  write: '#28C76F',
  edit: '#FF9F43',
};

export function WorkspaceTree({ files }: Props) {
  if (files.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="text-xs text-text-lo font-mono uppercase tracking-wider mb-2">Files</p>
      <div className="space-y-0.5">
        <AnimatePresence initial={false}>
          {files.map((f, idx) => (
            <motion.div
              key={`${f.action}-${f.path}-${idx}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2 py-0.5"
            >
              <span
                className="text-xs font-mono flex-shrink-0"
                style={{ color: ACTION_COLOR[f.action] }}
              >
                {ACTION_ICON[f.action]}
              </span>
              <span
                className="text-xs font-mono text-text-lo truncate"
                title={f.path}
              >
                {f.path}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
