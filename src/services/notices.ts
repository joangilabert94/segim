import { useEffect, useState } from 'preact/hooks';

export type NoticeKind = 'ok' | 'error' | 'info';

export interface NoticeAction {
  label: string;
  run: () => void;
}

export interface Notice {
  id: number;
  kind: NoticeKind;
  text: string;
  action?: NoticeAction;
}

let current: Notice | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

export function pushNotice(
  text: string,
  kind: NoticeKind = 'ok',
  options: { ms?: number; action?: NoticeAction } = {},
): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  current = { id: ++seq, kind, text, ...(options.action ? { action: options.action } : {}) };
  emit();

  const life = options.ms ?? (options.action ? 0 : kind === 'error' ? 12_000 : 6_000);
  if (life > 0) {
    timer = setTimeout(() => dismissNotice(), life);
  }
}

export function dismissNotice(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!current) return;
  current = null;
  emit();
}

export function useNotice(): Notice | null {
  const [notice, setNotice] = useState<Notice | null>(current);

  useEffect(() => {
    const fn = () => setNotice(current);
    listeners.add(fn);
    // Puede haber cambiado entre el render y la suscripción.
    fn();
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return notice;
}
