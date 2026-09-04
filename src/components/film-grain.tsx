import { useEffect, useRef } from "react";

export function FilmGrain() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const surface = canvas;
    const gfx: CanvasRenderingContext2D | null = canvas.getContext("2d", { alpha: true });
    if (!gfx) return;
    const g: CanvasRenderingContext2D = gfx;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frames: ImageData[] = [];
    let raf = 0;
    let last = 0;
    let fi = 0;

    function makeFrames() {
      const w = Math.max(160, Math.floor(window.innerWidth / 2.2));
      const h = Math.max(90, Math.floor(window.innerHeight / 2.2));
      surface.width = w;
      surface.height = h;
      const count = reduced ? 1 : 5;
      frames = [];
      for (let f = 0; f < count; f += 1) {
        const id = g.createImageData(w, h);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) {
          const speck = Math.random();
          if (speck > 0.12) {
            d[i] = 0;
            d[i + 1] = 0;
            d[i + 2] = 0;
            d[i + 3] = 0;
            continue;
          }
          const n = 200 + ((Math.random() * 55) | 0);
          d[i] = n;
          d[i + 1] = n;
          d[i + 2] = n;
          d[i + 3] = speck < 0.018 ? 48 + ((Math.random() * 50) | 0) : 10 + ((Math.random() * 22) | 0);
        }
        frames.push(id);
      }
      g.putImageData(frames[0], 0, 0);
    }

    makeFrames();
    const onResize = () => makeFrames();
    window.addEventListener("resize", onResize);

    if (reduced) {
      return () => window.removeEventListener("resize", onResize);
    }

    function tick(t: number) {
      raf = requestAnimationFrame(tick);
      if (t - last < 42) return;
      last = t;
      fi = (fi + 1) % frames.length;
      g.putImageData(frames[fi], 0, 0);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <>
      <div className="rw-grain pointer-events-none absolute inset-0 z-[55]" aria-hidden />
      <canvas
        ref={ref}
        className="rw-grain-live pointer-events-none absolute inset-0 z-[56] h-full w-full"
        aria-hidden
      />
    </>
  );
}
