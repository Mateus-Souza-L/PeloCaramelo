import { useEffect, useMemo, useRef, useState, useCallback } from "react";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export default function Carousel({
  children,
  itemClassName = "",
  className = "",
  viewportClassName = "",
  dotsClassName = "",
  arrows = true,
  dots = true,
  gapClassName = "gap-3",
}) {
  const viewportRef = useRef(null);
  const [active, setActive] = useState(0);

  const slides = useMemo(() => {
    const arr = Array.isArray(children) ? children : [children];
    return arr.filter(Boolean);
  }, [children]);

  const count = slides.length;

  const scrollToIndex = useCallback((idx) => {
    const el = viewportRef.current;
    if (!el) return;
    const items = el.querySelectorAll("[data-slide]");
    const target = items[idx];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, []);

  const goPrev = useCallback(
    () => scrollToIndex(clamp(active - 1, 0, count - 1)),
    [active, count, scrollToIndex]
  );
  const goNext = useCallback(
    () => scrollToIndex(clamp(active + 1, 0, count - 1)),
    [active, count, scrollToIndex]
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onScroll = () => {
      const items = el.querySelectorAll("[data-slide]");
      if (!items.length) return;

      const box = el.getBoundingClientRect();
      const center = box.left + box.width / 2;

      let bestIdx = 0;
      let bestDist = Infinity;

      items.forEach((it, idx) => {
        const r = it.getBoundingClientRect();
        const itCenter = r.left + r.width / 2;
        const dist = Math.abs(itCenter - center);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });

      setActive(bestIdx);
    };

    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [count]);

  if (count <= 1) {
    return <div className={className}>{slides}</div>;
  }

  return (
    <div className={`relative ${className}`}>
      <div
        ref={viewportRef}
        className={`flex ${gapClassName} overflow-x-auto scroll-smooth snap-x snap-mandatory px-1 pb-2 no-scrollbar ${viewportClassName}`}
        style={{ WebkitOverflowScrolling: "touch" }}
        aria-label="Carrossel"
      >
        {slides.map((node, i) => (
          <div
            key={i}
            data-slide
            className={`snap-center shrink-0 ${itemClassName}`}
            aria-label={`Slide ${i + 1} de ${count}`}
          >
            {node}
          </div>
        ))}
      </div>

      {arrows && (
        <>
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow px-3 py-2 text-sm font-bold text-[#5A3A22] active:scale-95"
            aria-label="Anterior"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow px-3 py-2 text-sm font-bold text-[#5A3A22] active:scale-95"
            aria-label="Próximo"
          >
            ›
          </button>
        </>
      )}

      {dots && (
        <div className={`mt-2 flex items-center justify-center gap-2 ${dotsClassName}`}>
          {Array.from({ length: count }).map((_, i) => {
            const isOn = i === active;
            return (
              <button
                key={i}
                type="button"
                onClick={() => scrollToIndex(i)}
                className={`h-2.5 w-2.5 rounded-full transition-transform active:scale-90 ${
                  isOn ? "bg-[#95301F]" : "bg-[#D2A679]"
                }`}
                aria-label={`Ir para ${i + 1}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
