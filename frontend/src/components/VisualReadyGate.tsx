import { useEffect, useState } from "react";
import { LoadingState } from "./LoadingState";

type VisualReadyGateProps = {
  scopeKey: string;
};

const SETTLE_DELAY_MS = 120;
const MAX_WAIT_MS = 12_000;

/**
 * Keeps the current view covered until its eager images have either loaded or
 * failed. Lazy images are intentionally excluded: they belong to content the
 * user has not reached yet and must not block the first render.
 */
export function VisualReadyGate({ scopeKey }: VisualReadyGateProps) {
  const [isWaiting, setIsWaiting] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let settleTimer: number | null = null;
    let failsafeTimer: number | null = null;
    let frameId: number | null = null;

    const clearTimers = () => {
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (failsafeTimer !== null) {
        window.clearTimeout(failsafeTimer);
        failsafeTimer = null;
      }
    };

    const getPendingImages = () =>
      Array.from(document.images).filter(
        (image) => image.src && image.loading !== "lazy" && !image.complete
      );

    const evaluate = () => {
      frameId = null;
      clearTimers();

      const pendingImages = getPendingImages();
      if (!pendingImages.length) {
        settleTimer = window.setTimeout(() => {
          if (isMounted) {
            setIsWaiting(false);
          }
        }, SETTLE_DELAY_MS);
        return;
      }

      setIsWaiting(true);
      const scheduleEvaluation = () => schedule();
      pendingImages.forEach((image) => {
        image.addEventListener("load", scheduleEvaluation, { once: true });
        image.addEventListener("error", scheduleEvaluation, { once: true });
      });

      // A bad remote image should never leave the app behind a loader forever.
      failsafeTimer = window.setTimeout(() => {
        if (isMounted) {
          setIsWaiting(false);
        }
      }, MAX_WAIT_MS);
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
      attributeFilter: ["src", "srcset", "loading"]
    });

    setIsWaiting(true);
    schedule();

    return () => {
      isMounted = false;
      observer.disconnect();
      clearTimers();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [scopeKey]);

  if (!isWaiting) {
    return null;
  }

  return (
    <div className="visual-ready-gate" role="status" aria-live="polite">
      <LoadingState label="Cargando imágenes..." />
    </div>
  );
}
