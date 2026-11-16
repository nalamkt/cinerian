import { useEffect, useRef, type TouchEvent as ReactTouchEvent } from "react";
import { createPortal } from "react-dom";

const SWIPE_CLOSE_PX = 60;

/*
  Hoja que sube desde abajo con la sinopsis (solo mobile). Va en un portal
  fuera del tráiler: así sus toques nunca llegan a los gestos de pasar de
  película ni abren la ficha.
*/
export function DiscoverSynopsisSheet({ open, text, onClose }: { open: boolean; text: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const touchStartRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusTo?.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    touchStartRef.current = event.touches[0]?.clientY ?? null;
  }

  // Deslizar hacia abajo la cierra, salvo que el texto esté scrolleado.
  function handleTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const end = event.changedTouches[0]?.clientY;
    if (start === null || end === undefined) return;
    if (end - start > SWIPE_CLOSE_PX && (textRef.current?.scrollTop ?? 0) <= 0) onClose();
  }

  return createPortal(
    <div className="discover-synopsis-sheet">
      <button type="button" className="discover-synopsis-sheet__backdrop" aria-label="Cerrar sinopsis" tabIndex={-1} onClick={onClose} />
      <div
        className="discover-synopsis-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discover-synopsis-title"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <span className="discover-synopsis-sheet__handle" aria-hidden="true" />
        <button ref={closeRef} type="button" className="discover-synopsis-sheet__close" aria-label="Cerrar sinopsis" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <p id="discover-synopsis-title" className="discover-synopsis-sheet__label">Sinopsis</p>
        <p ref={textRef} className="discover-synopsis-sheet__text">{text}</p>
      </div>
    </div>,
    document.body
  );
}
