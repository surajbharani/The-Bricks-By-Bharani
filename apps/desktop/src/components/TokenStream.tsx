import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface Props {
  text: string;
  streaming: boolean;
}

export function TokenStream({ text, streaming }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [text]);

  if (!text && !streaming) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 p-3 bg-bg-void/60 rounded-lg border border-border-hair"
    >
      <p className="text-xs text-text-lo mb-1 font-mono uppercase tracking-wider">Output</p>
      <pre
        className="text-text-hi whitespace-pre-wrap leading-relaxed"
        style={{ fontFamily: 'var(--mono)', fontSize: 'var(--chat-font-size, 19px)' }}
      >
        {text}
        {streaming && (
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity }}
            className="inline-block w-1.5 h-4 bg-red-core ml-0.5 align-text-bottom"
          />
        )}
      </pre>
      <div ref={endRef} />
    </motion.div>
  );
}
