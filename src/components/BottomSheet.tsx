// Panel inferior deslizante (modales de acciones, notas, presets...).

import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ComponentChildren;
}

export function BottomSheet({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div class="overlay" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div class="sheet-handle" />
        {title && <h3 class="sheet-title">{title}</h3>}
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}
