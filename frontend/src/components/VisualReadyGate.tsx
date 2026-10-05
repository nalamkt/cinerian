import { useEffect, useState } from "react";
import { LoadingState } from "./LoadingState";

type VisualReadyGateProps = {
  /*
    Mientras sea false la cortina no se levanta aunque las imagenes ya esten
    listas. Evita que se vea el salto de vista mientras se restaura la que quedo
    guardada para esta persona.
  */
  canReveal: boolean;
};

const SETTLE_DELAY_MS = 120;
const MAX_WAIT_MS = 4_000;

/**
 * Cubre la primera pintura hasta que las imagenes visibles terminaron de cargar,
 * y despues se va para siempre.
 *
 * Tres reglas que no se pueden romper:
 *
 * - Una sola vez. Volver a tapar una interfaz que la persona ya esta viendo es
 *   peor que no haberla tapado nunca: eso era lo que producia la seguidilla de
 *   flashes al entrar, porque cada panel que terminaba de traer datos insertaba
 *   imagenes nuevas y devolvia la cortina encima de la app.
 *
 * - Solo mira lo visible. La app monta las cuatro vistas juntas y esconde las
 *   inactivas con [hidden]; sus imagenes no tienen por que demorar la vista que
 *   la persona si esta mirando.
 *
 * - Siempre se levanta. El failsafe corre desde el montaje y no depende de
 *   ninguna otra condicion, asi una imagen remota colgada o una vista que nunca
 *   termina de restaurarse no pueden dejar la app atras de la cortina.
 */
export function VisualReadyGate({ canReveal }: VisualReadyGateProps) {
  const [areImagesReady, setAreImagesReady] = useState(false);
  const [isForced, setIsForced] = useState(false);

  useEffect(() => {
    const failsafeTimer = window.setTimeout(() => setIsForced(true), MAX_WAIT_MS);
    return () => window.clearTimeout(failsafeTimer);
  }, []);

  useEffect(() => {
    if (areImagesReady) {
      return;
    }

    let isMounted = true;
    let settleTimer: number | null = null;
    let frameId: number | null = null;

    const clearSettleTimer = () => {
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
    };

    const getPendingImages = () =>
      Array.from(document.images).filter(
        (image) =>
          image.src &&
          image.loading !== "lazy" &&
          !image.complete &&
          !image.closest("[hidden]")
      );

    const evaluate = () => {
      frameId = null;
      clearSettleTimer();

      const pendingImages = getPendingImages();
      if (!pendingImages.length) {
        settleTimer = window.setTimeout(() => {
          if (isMounted) {
            setAreImagesReady(true);
          }
        }, SETTLE_DELAY_MS);
        return;
      }

      const scheduleEvaluation = () => schedule();
      pendingImages.forEach((image) => {
        image.addEventListener("load", scheduleEvaluation, { once: true });
        image.addEventListener("error", scheduleEvaluation, { once: true });
      });
    };

    const schedule = () => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(evaluate);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcset", "loading", "hidden"]
    });

    schedule();

    return () => {
      isMounted = false;
      observer.disconnect();
      clearSettleTimer();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [areImagesReady]);

  if (isForced || (areImagesReady && canReveal)) {
    return null;
  }

  return (
    <div className="visual-ready-gate" role="status" aria-live="polite">
      <LoadingState />
    </div>
  );
}
