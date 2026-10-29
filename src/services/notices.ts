// Avisos efímeros (tipo toast) para acciones que terminan en segundo plano.
//
// La copia automática en Drive acaba *después* de navegar (al cerrar la sesión
// pasamos al historial), así que su confirmación no puede vivir en el estado de
// una vista: se publica aquí y la pinta el armazón de la app.
//
// Regla: nunca se apilan dos avisos. El nuevo reemplaza al anterior, para que
// una ráfaga de subidas no deje una torre de mensajes.

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

/**
 * Muestra un aviso durante `ms` milisegundos (`0` = no se cierra solo).
 * Los errores duran más: hay que poder leerlos y decidir qué hacer; uno con
 * acción espera a que se use o se cierre.
 */
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

/** Hook: el aviso visible ahora mismo (o null). */
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
