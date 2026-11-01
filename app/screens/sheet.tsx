"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Sheet({
  open,
  onClose,
  children,
  variant = "bottom",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  variant?: "bottom" | "center";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={variant === "center" ? "sheet sheet-center" : "sheet"}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="sheet-content">{children}</div>
    </dialog>
  );
}
