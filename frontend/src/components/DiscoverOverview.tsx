import { useEffect, useLayoutEffect, useRef, useState } from "react";

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function DiscoverOverview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useBrowserLayoutEffect(() => {
    setExpanded(false);
    setClamped(false);
  }, [text]);

  useBrowserLayoutEffect(() => {
    const element = ref.current;
    if (!element || expanded) return;
    const measure = () => {
      const node = ref.current;
      if (!node) return;
      const height = node.getBoundingClientRect().height;
      node.classList.remove("discover-overview__text--clamped");
      const naturalHeight = node.getBoundingClientRect().height;
      node.classList.add("discover-overview__text--clamped");
      if (height > 0) setClamped(naturalHeight > height + 1);
    };
    measure();
    const raf = window.requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 300);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    void document.fonts?.ready.then(measure).catch(() => {});
    return () => { window.cancelAnimationFrame(raf); window.clearTimeout(timer); observer.disconnect(); };
  }, [expanded, text]);

  return <div className="discover-overview" data-discover-overview>
    <p ref={ref} className={expanded ? undefined : "discover-overview__text--clamped"}>{text}</p>
    {clamped ? <button type="button" className="discover-overview__more"
      onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      {expanded ? "Ver menos" : "Ver más"}
    </button> : null}
  </div>;
}
