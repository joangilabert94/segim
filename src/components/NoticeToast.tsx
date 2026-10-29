// Pinta el aviso efímero global (ver services/notices.ts).
// Vive en el armazón de la app para que sobreviva a los cambios de pantalla:
// terminar una sesión navega al historial y la confirmación debe seguir viéndose.

import { dismissNotice, useNotice } from '../services/notices';

export function NoticeToast() {
  const notice = useNotice();
  if (!notice) return null;

  return (
    <div
      class={`toast is-${notice.kind}`}
      role={notice.kind === 'error' ? 'alert' : 'status'}
      aria-live={notice.kind === 'error' ? 'assertive' : 'polite'}
    >
      <span class="toast-text">{notice.text}</span>
      <button class="toast-close" aria-label="Cerrar aviso" onClick={() => dismissNotice()}>
        ✕
      </button>
    </div>
  );
}
