import { X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div
      className="assets-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="assets-modal" style={{ width: "min(460px, 100%)" }}>
        <div className="assets-modal-header">
          <div>
            <h3>{title}</h3>
            {description && (
              <p style={{ whiteSpace: "pre-line", marginTop: 6 }}>{description}</p>
            )}
          </div>
          <button
            type="button"
            className="assets-icon-btn"
            aria-label="关闭"
            disabled={busy}
            onClick={onCancel}
          >
            <X size={16} />
          </button>
        </div>
        <div className="assets-modal-footer">
          <button type="button" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? "danger" : "primary"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "处理中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ConfirmRequest {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function useConfirmDialog() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmRequest | string) => {
    const normalized: ConfirmRequest =
      typeof options === "string" ? { title: "确认操作", description: options } : options;
    return new Promise<boolean>((resolve) => {
      resolver.current?.(false);
      resolver.current = resolve;
      setRequest(normalized);
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    const done = resolver.current;
    resolver.current = null;
    setRequest(null);
    done?.(ok);
  }, []);

  const dialog = (
    <ConfirmDialog
      open={request !== null}
      title={request?.title ?? ""}
      description={request?.description}
      confirmLabel={request?.confirmLabel}
      cancelLabel={request?.cancelLabel}
      danger={request?.danger}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, dialog };
}
