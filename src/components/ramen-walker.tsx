import { useEffect, useRef, useState } from "react";
import { FilmGrain } from "@/components/film-grain";
import { useGame } from "@/game/store";
import type { RamenGame } from "@/game/engine";

export function RamenWalker() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<RamenGame | null>(null);
  const phase = useGame((s) => s.phase);
  const ready = useGame((s) => s.ready);
  const webglError = useGame((s) => s.webglError);
  const distance = useGame((s) => s.distance);
  const warning = useGame((s) => s.warning);
  const endingTitle = useGame((s) => s.endingTitle);
  const endingHtml = useGame((s) => s.endingHtml);
  const flash = useGame((s) => s.flash);
  const whiteout = useGame((s) => s.whiteout);
  const spilled = useGame((s) => s.spilled);
  const hitKind = useGame((s) => s.hitKind);
  const hitId = useGame((s) => s.hitId);
  const lookHint = useGame((s) => s.lookHint);
  const isCoarse = useGame((s) => s.isCoarse);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720;
    useGame.getState().setCoarse(coarse);
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let game: RamenGame | null = null;
    void Promise.all([import("@/game/engine"), import("@/game/art"), import("@/game/characters")])
      .then(async ([{ RamenGame }, { loadGameArt }, { loadCharacterModels }]) => {
        if (disposed || !canvasRef.current) return;
        try {
          const [art, chars] = await Promise.all([loadGameArt(), loadCharacterModels()]);
          if (disposed || !canvasRef.current) return;
          game = new RamenGame(canvasRef.current, art, chars);
          gameRef.current = game;
          if (useGame.getState().phase === "playing") game.start();
        } catch {
          useGame.getState().setWebglError();
        }
      })
      .catch(() => useGame.getState().setWebglError());
    return () => {
      disposed = true;
      game?.dispose();
      gameRef.current = null;
    };
  }, []);

  function begin() {
    useGame.getState().setPhase("playing");
    gameRef.current?.start();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useGame.getState().phase !== "title") return;
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        useGame.getState().setPhase("playing");
        gameRef.current?.start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-rw-bg text-rw-fg touch-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        onContextMenu={(e) => e.preventDefault()}
      />

      <div className="pointer-events-none absolute inset-0 rw-vignette rw-chroma" />
      <FilmGrain />
      <div className="rw-film-scratches pointer-events-none absolute inset-0 z-[57]" />
      {phase === "playing" && spilled && hitKind !== "death" && (
        <div className="rw-spill-warp" />
      )}
      {hitKind !== "none" && (
        <HitFx key={hitId} kind={hitKind} />
      )}
      <div
        className="pointer-events-none absolute inset-0 z-40 bg-rw-danger"
        style={{ opacity: flash ? 0.28 : 0 }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-50 bg-white"
        style={{ opacity: whiteout }}
      />

      {phase === "playing" && (
        <Hud distance={distance} warning={warning} lookHint={lookHint} />
      )}

      {phase === "playing" && isCoarse && (
        <TouchControls
          onMove={(x, y) => gameRef.current?.setMoveAxis(x, y)}
          onLook={(dx, dy) => gameRef.current?.addLookDelta(dx, dy)}
          onBalance={(dx, dy) => gameRef.current?.addBalanceDelta(dx, dy)}
          onAdvance={() => gameRef.current?.advanceDialogue()}
        />
      )}

      {phase === "title" && (
        <TitleScreen onBegin={begin} ready={ready} webglError={webglError} />
      )}

      {phase === "ending" && <EndScreen title={endingTitle} html={endingHtml} />}
    </div>
  );
}

function HitFx({ kind }: { kind: "scare" | "death" }) {
  useEffect(() => {
    if (kind !== "scare") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => {
      if (useGame.getState().hitKind === "scare") useGame.getState().pulseHit("none");
    }, reduced ? 280 : 1050);
    return () => window.clearTimeout(t);
  }, [kind]);

  return (
    <div
      className={`rw-hit rw-hit-${kind}`}
      onAnimationEnd={(e) => {
        if (kind !== "scare") return;
        if (!(e.target instanceof HTMLElement)) return;
        if (!e.target.classList.contains("rw-hit-blood")) return;
        if (useGame.getState().hitKind === "scare") useGame.getState().pulseHit("none");
      }}
    >
      <div className="rw-hit-warp" />
      <img
        className="rw-hit-blood"
        src="/fx/blood-splatter.png"
        alt=""
        aria-hidden
        draggable={false}
      />
    </div>
  );
}

function TitleScreen({
  onBegin,
  ready,
  webglError,
}: {
  onBegin: () => void;
  ready: boolean;
  webglError: boolean;
}) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-rw-bg px-6 text-center">
      <div className="pointer-events-none absolute inset-0 rw-title-wash" />
      <div className="relative max-w-md">
        <p className="mb-5 font-sans text-xs font-medium uppercase tracking-widest text-rw-subtle">
          Keep the bowl on the tray
        </p>
        <h1 className="font-display text-5xl font-semibold tracking-wide text-rw-fg sm:text-6xl">
          RAMEN WALKER
        </h1>
        <p className="mt-3 font-display text-lg italic text-rw-muted">a game about getting home</p>
        <p className="mx-auto mt-8 max-w-sm text-sm leading-relaxed text-rw-muted">
          You are carrying dinner down a road that does not want you to finish. Keep the bowl
          on the tray. Do not look back.
        </p>
        <ul className="mx-auto mt-8 max-w-sm space-y-1.5 text-left text-sm text-rw-muted">
          <li>
            <b className="font-medium text-rw-fg">WASD</b> walk
          </li>
          <li>
            <b className="font-medium text-rw-fg">Mouse left/right</b> keep the bowl on the tray
          </li>
          <li>
            <b className="font-medium text-rw-fg">Hold left click</b> look around
          </li>
          <li>
            <b className="font-medium text-rw-fg">Shift</b> hurry (not recommended)
          </li>
        </ul>
        {webglError ? (
          <p className="mt-10 text-sm text-rw-danger">This device cannot draw the road.</p>
        ) : (
          <button
            type="button"
            onClick={onBegin}
            className="mt-10 min-h-11 min-w-44 border border-rw-border bg-rw-accent px-10 py-3 font-sans text-sm font-medium tracking-widest text-rw-accent-fg transition-colors duration-200 hover:bg-rw-fg"
          >
            BEGIN WALK
          </button>
        )}
        {!ready && !webglError && (
          <p className="mt-4 text-xs tracking-widest text-rw-subtle">Lighting the road</p>
        )}
      </div>
    </div>
  );
}

function Hud({
  distance,
  warning,
  lookHint,
}: {
  distance: number;
  warning: string | null;
  lookHint: boolean;
}) {
  return (
    <>
      <div className="pointer-events-none absolute left-6 top-6 z-10 font-sans text-xs tracking-widest text-rw-subtle tabular-nums">
        {distance}m
      </div>
      {lookHint && (
        <div className="pointer-events-none absolute left-1/2 top-5 z-10 -translate-x-1/2 bg-rw-bg/70 px-3 py-1.5 font-sans text-xs text-rw-muted">
          mouse locked · hold LMB to look
        </div>
      )}
      {warning && (
        <div className="rw-warn pointer-events-none absolute left-1/2 top-[38%] z-20 -translate-x-1/2 text-center font-display text-2xl tracking-widest text-rw-danger">
          {warning}
        </div>
      )}
    </>
  );
}

function EndScreen({ title, html }: { title: string; html: string }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-rw-bg px-6 text-center">
      <h2 className="font-display text-3xl font-semibold tracking-wide text-rw-fg">{title}</h2>
      <p
        className="mt-6 max-w-md font-sans text-sm leading-relaxed text-rw-muted"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <p className="mt-16 font-sans text-xs tracking-widest text-rw-subtle">RAMEN WALKER</p>
    </div>
  );
}

function TouchControls({
  onMove,
  onLook,
  onBalance,
  onAdvance,
}: {
  onMove: (x: number, y: number) => void;
  onLook: (dx: number, dy: number) => void;
  onBalance: (dx: number, dy: number) => void;
  onAdvance: () => void;
}) {
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  const look = useRef<{ x: number; y: number; id: number } | null>(null);
  const balance = useRef<{ x: number; y: number; id: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  return (
    <>
      <div
        className="absolute bottom-8 left-6 z-30 h-28 w-28 rounded-full border border-rw-border bg-rw-bg-elevated/50"
        onPointerDown={(e) => {
          origin.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!origin.current || origin.current.id !== e.pointerId) return;
          const dx = e.clientX - origin.current.x;
          const dy = e.clientY - origin.current.y;
          const max = 42;
          const len = Math.hypot(dx, dy);
          const s = len > max ? max / len : 1;
          const x = (dx * s) / max;
          const y = (-dy * s) / max;
          setKnob({ x: dx * s, y: dy * s });
          onMove(x, y);
        }}
        onPointerUp={() => {
          origin.current = null;
          setKnob({ x: 0, y: 0 });
          onMove(0, 0);
        }}
        onPointerCancel={() => {
          origin.current = null;
          setKnob({ x: 0, y: 0 });
          onMove(0, 0);
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rw-accent/80"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>
      <div
        className="absolute inset-y-0 left-1/4 right-1/4 z-20"
        onPointerDown={(e) => {
          balance.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!balance.current || balance.current.id !== e.pointerId) return;
          onBalance(e.clientX - balance.current.x, 0);
          balance.current.x = e.clientX;
          balance.current.y = e.clientY;
        }}
        onPointerUp={() => {
          balance.current = null;
        }}
      />
      <div
        className="absolute inset-y-0 right-0 z-20 w-1/4"
        onPointerDown={(e) => {
          look.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!look.current || look.current.id !== e.pointerId) return;
          onLook(e.clientX - look.current.x, e.clientY - look.current.y);
          look.current.x = e.clientX;
          look.current.y = e.clientY;
        }}
        onPointerUp={() => {
          look.current = null;
        }}
      />
      <button
        type="button"
        onClick={onAdvance}
        className="absolute bottom-24 right-6 z-30 min-h-11 border border-rw-border bg-rw-bg-elevated/80 px-4 font-sans text-xs tracking-widest text-rw-muted"
      >
        SKIP
      </button>
    </>
  );
}
