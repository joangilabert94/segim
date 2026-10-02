// Diálogo de confirmación centrado (acciones destructivas, cambios de sesión).

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;
  return (
    <div class="overlay overlay-center" onClick={onCancel}>
      <div
        class="dialog"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <h3 class="dialog-title">{title}</h3>
        <p class="dialog-message">{message}</p>
        <div class="dialog-actions">
          <button class="btn btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button class={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
