import { useEffect, useRef, type ReactNode, type TouchEvent } from "react";
import { createPortal } from "react-dom";

type WatchlistSheetProps = {
  /** Nombre accesible del panel. */
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

/** Alto de la franja superior desde la que se puede arrastrar para cerrar. */
const DRAG_ZONE_HEIGHT = 76;
/** Cuanto hay que bajar el panel para que soltarlo lo cierre. */
const CLOSE_THRESHOLD = 90;

/**
 * Panel que sube desde abajo, para la Watchlist en mobile: ahi no hay hover y
 * el pulgar llega comodo solo a la mitad inferior de la pantalla, asi que los
 * filtros y las acciones de un titulo viven aca en vez de en menus chicos.
 *
 * Se cierra tocando afuera o arrastrando hacia abajo desde la parte de arriba
 * (la manija y el encabezado). El arrastre no arranca desde el contenido para
 * no pelearse con el scroll de las listas largas.
 */
export function WatchlistSheet({ label, onClose, children, className = "" }: WatchlistSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const dragOffset = useRef(0);

  // Mientras esta abierto, lo de atras no scrollea.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const startY = event.touches[0].clientY;
    if (startY - panel.getBoundingClientRect().top > DRAG_ZONE_HEIGHT) {
      return;
    }

    dragStartY.current = startY;
    dragOffset.current = 0;
    panel.style.transition = "none";
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    const panel = panelRef.current;
    if (!panel || dragStartY.current === null) {
      return;
    }

    dragOffset.current = Math.max(0, event.touches[0].clientY - dragStartY.current);
    panel.style.transform = `translateY(${dragOffset.current}px)`;
  }

  function handleTouchEnd() {
    const panel = panelRef.current;
    if (!panel || dragStartY.current === null) {
      return;
    }

    dragStartY.current = null;

    if (dragOffset.current > CLOSE_THRESHOLD) {
      onClose();
      return;
    }

    // No alcanzo: vuelve a su lugar.
    panel.style.transition = "transform 180ms ease-out";
    panel.style.transform = "";
  }

  return createPortal(
    <div className="watchlist-sheet">
      {/* Escape lo maneja el handler global de App via `data-escape-dismiss`. */}
      <button
        type="button"
        className="watchlist-sheet__backdrop"
        aria-label="Cerrar"
        data-escape-dismiss=""
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`watchlist-sheet__panel ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <span className="watchlist-sheet__handle" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.body
  );
}
