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
      {notice.action && (
        <button
          class="btn btn-sm toast-action"
          onClick={() => {
            const run = notice.action?.run;
            dismissNotice();
            run?.();
          }}
        >
          {notice.action.label}
        </button>
      )}
      <button class="toast-close" aria-label="Cerrar aviso" onClick={() => dismissNotice()}>
        ✕
      </button>
    </div>
  );
}
