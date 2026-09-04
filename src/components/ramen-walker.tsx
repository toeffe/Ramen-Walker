import { useEffect, useRef, useState } from "react";
import { FilmGrain } from "@/components/film-grain";
import { useGame } from "@/game/store";
import type { RamenGame } from "@/game/engine";
import {
  connectCoopRoom,
  generateRoomCode,
  getLobbyUrlCode,
  setLobbyUrl,
  shareUrlForCode,
  type CoopRoom,
} from "@/game/multiplayer";

export function RamenWalker() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waiterCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<RamenGame | null>(null);
  const coopRef = useRef<CoopRoom | null>(null);
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
  const mpRole = useGame((s) => s.mpRole);
  const mpStatus = useGame((s) => s.mpStatus);
  const mpRoomCode = useGame((s) => s.mpRoomCode);
  const mpError = useGame((s) => s.mpError);

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
          const mp = useGame.getState();
          if (mp.mpRole === "waiter") game.setRemoteDriven(true);
          if (mp.mpRole === "walker" && mp.mpStatus === "connected") game.setWaiterOwnsTray(true);
          if (mp.phase === "playing" && mp.mpRole !== "waiter") {
            game.start();
          }
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

  // If a shared invite link (?lobby=CODE) was opened, jump straight into
  // "join" mode on the title screen instead of making the guest hunt for
  // where to type the code.
  const [pendingJoinCode] = useState(() => getLobbyUrlCode());

  // --- co-op networking: connect/host, wire the per-frame sync loop ----
  // Do not depend on mpStatus: hosting → connected would otherwise leave
  // the room in the effect cleanup and drop the peer immediately.
  useEffect(() => {
    if (mpRole !== "walker" && mpRole !== "waiter") return;
    if (!mpRoomCode) return;

    const isHost = mpRole === "walker";
    const coop = connectCoopRoom(mpRoomCode, isHost);
    coopRef.current = coop;
    let cancelled = false;
    let armRaf = 0;

    coop.onPeerJoin(() => {
      useGame.getState().setMpStatus("connected");
      if (!isHost) return;
      const arm = () => {
        if (cancelled) return;
        const g = gameRef.current;
        if (!g) {
          armRaf = requestAnimationFrame(arm);
          return;
        }
        g.setWaiterOwnsTray(true);
      };
      arm();
    });
    coop.onPeerLeave(() => {
      useGame.getState().setMpError("The other player disconnected.");
      if (isHost) gameRef.current?.setWaiterOwnsTray(false);
    });

    let raf = 0;
    if (isHost) {
      // Walker: stream authoritative state every frame. The Waiter's
      // tilt deltas arrive async and get forwarded straight into the
      // same addBalanceDelta() the mouse already uses.
      coop.onWaiterInput((input) => {
        gameRef.current?.addBalanceDelta(input.dx, input.dy);
      });
      let sending = false;
      const pump = () => {
        const g = gameRef.current;
        if (g && !sending && useGame.getState().mpStatus === "connected") {
          sending = true;
          void coop
            .sendHostState(g.getHostSnapshot())
            .catch(() => undefined)
            .finally(() => {
              sending = false;
            });
        }
        raf = requestAnimationFrame(pump);
      };
      raf = requestAnimationFrame(pump);
    } else {
      // Waiter: thin client. Apply whatever the Host streams, and send
      // tray-tilt deltas the opposite way. The Waiter never presses
      // "begin" themselves — their phase follows the Host's `started`
      // flag once it arrives.
      const armRemote = () => {
        const g = gameRef.current;
        if (!g) {
          raf = requestAnimationFrame(armRemote);
          return;
        }
        g.setRemoteDriven(true);
      };
      armRemote();
      coop.onHostState((state) => {
        gameRef.current?.applyHostSnapshot(state);
        if (state.started && useGame.getState().phase !== "playing") {
          useGame.getState().setPhase("playing");
        }
      });
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(armRaf);
      coop.leave();
      coopRef.current = null;
    };
  }, [mpRole, mpRoomCode]);

  // Waiter's own mirrored camera, once the game and its canvas exist.
  useEffect(() => {
    if (mpRole !== "waiter") return;
    const canvas = waiterCanvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const tryEnable = () => {
      if (cancelled) return;
      const g = gameRef.current;
      if (!g) {
        requestAnimationFrame(tryEnable);
        return;
      }
      g.enableWaiterView(canvas);
    };
    tryEnable();
    return () => {
      cancelled = true;
      gameRef.current?.disableWaiterView();
    };
  }, [mpRole]);

  function begin() {
    useGame.getState().setPhase("playing");
    gameRef.current?.start();
  }

  function hostGame() {
    const code = generateRoomCode();
    setLobbyUrl(code);
    useGame.getState().setMpRole("walker");
    useGame.getState().setMpRoomCode(code);
    useGame.getState().setMpStatus("hosting");
    useGame.getState().setMpError(null);
  }

  function joinGame(code: string) {
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    if (clean.length !== 5) {
      useGame.getState().setMpError("Room codes are 5 characters.");
      return;
    }
    setLobbyUrl(clean);
    useGame.getState().setMpRole("waiter");
    useGame.getState().setMpRoomCode(clean);
    useGame.getState().setMpStatus("connecting");
    useGame.getState().setMpError(null);
    gameRef.current?.unlockAudio();
  }

  function playSolo() {
    setLobbyUrl(null);
    useGame.getState().setMpRole("solo");
    useGame.getState().setMpStatus("idle");
    useGame.getState().setMpRoomCode(null);
    begin();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useGame.getState().phase !== "title") return;
      if (useGame.getState().mpStatus !== "idle") return;
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        setLobbyUrl(null);
        const g = useGame.getState();
        g.setMpRole("solo");
        g.setMpStatus("idle");
        g.setMpRoomCode(null);
        g.setPhase("playing");
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
        style={mpRole === "waiter" ? { visibility: "hidden" } : undefined}
        onContextMenu={(e) => e.preventDefault()}
      />
      {mpRole === "waiter" && (
        <canvas
          ref={waiterCanvasRef}
          className="absolute inset-0 z-[1] block h-full w-full"
          onContextMenu={(e) => e.preventDefault()}
        />
      )}

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

      {phase === "playing" && mpRole !== "waiter" && (
        <Hud
          distance={distance}
          warning={warning}
          lookHint={lookHint}
          waiterConnected={mpRole === "walker" && mpStatus === "connected"}
        />
      )}

      {phase === "playing" && mpRole === "waiter" && (
        <WaiterHud
          onBalance={(dx, dy) => coopRef.current?.sendWaiterInput({ dx, dy })}
          onEngage={() => gameRef.current?.unlockAudio()}
        />
      )}

      {phase === "playing" && isCoarse && mpRole !== "waiter" && (
        <TouchControls
          onMove={(x, y) => gameRef.current?.setMoveAxis(x, y)}
          onLook={(dx, dy) => gameRef.current?.addLookDelta(dx, dy)}
          onBalance={(dx, dy) => {
            if (mpRole === "walker" && mpStatus === "connected") return;
            gameRef.current?.addBalanceDelta(dx, dy);
          }}
          hideBalance={mpRole === "walker" && mpStatus === "connected"}
          onAdvance={() => gameRef.current?.advanceDialogue()}
        />
      )}

      {phase === "title" && (
        <TitleScreen
          onBegin={begin}
          ready={ready}
          webglError={webglError}
          pendingJoinCode={pendingJoinCode}
          mpRole={mpRole}
          mpStatus={mpStatus}
          mpRoomCode={mpRoomCode}
          mpError={mpError}
          onHost={hostGame}
          onJoin={joinGame}
          onSolo={playSolo}
        />
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
  pendingJoinCode,
  mpRole,
  mpStatus,
  mpRoomCode,
  mpError,
  onHost,
  onJoin,
  onSolo,
}: {
  onBegin: () => void;
  ready: boolean;
  webglError: boolean;
  pendingJoinCode: string | null;
  mpRole: "solo" | "walker" | "waiter";
  mpStatus: "idle" | "hosting" | "connecting" | "connected" | "error";
  mpRoomCode: string | null;
  mpError: string | null;
  onHost: () => void;
  onJoin: (code: string) => void;
  onSolo: () => void;
}) {
  const [showLobby, setShowLobby] = useState(!!pendingJoinCode);
  const [joinCodeInput, setJoinCodeInput] = useState(pendingJoinCode ?? "");

  // Waiting-for-connection screen (host waiting for a guest, or guest
  // waiting to finish connecting).
  if (mpStatus === "hosting" || mpStatus === "connecting" || mpStatus === "connected") {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-rw-bg px-6 text-center">
        <div className="pointer-events-none absolute inset-0 rw-title-wash" />
        <div className="relative max-w-md">
          <p className="mb-5 font-sans text-xs font-medium uppercase tracking-widest text-rw-subtle">
            Two players, one tray
          </p>
          {mpStatus === "hosting" && mpRoomCode && (
            <>
              <h2 className="font-display text-2xl font-semibold text-rw-fg">Waiting for the waiter…</h2>
              <p className="mt-4 text-sm text-rw-muted">Share this link or code:</p>
              <p className="mt-3 font-display text-4xl tracking-[0.3em] text-rw-fg">{mpRoomCode}</p>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(shareUrlForCode(mpRoomCode))}
                className="mt-4 min-h-11 border border-rw-border bg-rw-bg-elevated/60 px-6 py-2 font-sans text-xs tracking-widest text-rw-muted hover:text-rw-fg"
              >
                COPY INVITE LINK
              </button>
            </>
          )}
          {mpStatus === "connecting" && (
            <>
              <h2 className="font-display text-2xl font-semibold text-rw-fg">Connecting…</h2>
              <p className="mt-4 text-sm text-rw-muted">Room {mpRoomCode}</p>
            </>
          )}
          {mpStatus === "connected" && (
            <>
              <h2 className="font-display text-2xl font-semibold text-rw-fg">Connected</h2>
              <p className="mt-4 text-sm text-rw-muted">You're carrying the tray together now.</p>
              {mpRole === "walker" ? (
                <button
                  type="button"
                  onClick={onBegin}
                  className="mt-8 min-h-11 min-w-44 border border-rw-border bg-rw-accent px-10 py-3 font-sans text-sm font-medium tracking-widest text-rw-accent-fg transition-colors duration-200 hover:bg-rw-fg"
                >
                  BEGIN WALK
                </button>
              ) : (
                <p className="mt-8 text-xs tracking-widest text-rw-subtle">
                  waiting for the walker to begin…
                </p>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  if (showLobby) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-rw-bg px-6 text-center">
        <div className="pointer-events-none absolute inset-0 rw-title-wash" />
        <div className="relative max-w-md">
          <p className="mb-5 font-sans text-xs font-medium uppercase tracking-widest text-rw-subtle">
            Two players, one tray
          </p>
          <h1 className="font-display text-4xl font-semibold tracking-wide text-rw-fg">
            WALK TOGETHER
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-rw-muted">
            One of you walks and looks. The other keeps the bowl from spilling, facing back
            the whole way.
          </p>

          <div className="mt-8 space-y-3 text-left">
            <button
              type="button"
              onClick={onHost}
              className="min-h-11 w-full border border-rw-border bg-rw-bg-elevated/60 px-6 py-3 font-sans text-sm tracking-widest text-rw-fg hover:bg-rw-bg-elevated"
            >
              HOST — I'll walk
            </button>
            <div className="flex gap-2">
              <input
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                maxLength={5}
                className="min-h-11 flex-1 border border-rw-border bg-rw-bg-elevated/40 px-4 font-sans text-sm tracking-[0.2em] text-rw-fg placeholder:text-rw-subtle"
              />
              <button
                type="button"
                onClick={() => onJoin(joinCodeInput)}
                className="min-h-11 border border-rw-border bg-rw-bg-elevated/60 px-6 font-sans text-sm tracking-widest text-rw-fg hover:bg-rw-bg-elevated"
              >
                JOIN — I'll balance
              </button>
            </div>
            {mpError && <p className="text-xs text-rw-danger">{mpError}</p>}
          </div>

          <button
            type="button"
            onClick={() => setShowLobby(false)}
            className="mt-6 font-sans text-xs tracking-widest text-rw-subtle hover:text-rw-muted"
          >
            ← back
          </button>
        </div>
      </div>
    );
  }

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
          <div className="mt-10 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={onSolo}
              className="min-h-11 min-w-44 border border-rw-border bg-rw-accent px-10 py-3 font-sans text-sm font-medium tracking-widest text-rw-accent-fg transition-colors duration-200 hover:bg-rw-fg"
            >
              BEGIN WALK
            </button>
            <button
              type="button"
              onClick={() => setShowLobby(true)}
              className="font-sans text-xs tracking-widest text-rw-subtle hover:text-rw-muted"
            >
              walk with someone →
            </button>
          </div>
        )}
        {!ready && !webglError && (
          <p className="mt-4 text-xs tracking-widest text-rw-subtle">Lighting the road</p>
        )}
      </div>
    </div>
  );
}

function WaiterHud({
  onBalance,
  onEngage,
}: {
  onBalance: (dx: number, dy: number) => void;
  onEngage?: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const onBalanceRef = useRef(onBalance);
  onBalanceRef.current = onBalance;
  const [locked, setLocked] = useState(false);
  const warning = useGame((s) => s.warning);

  useEffect(() => {
    const overlay = overlayRef.current;
    const onChange = () => {
      setLocked(document.pointerLockElement === overlayRef.current);
    };
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== overlayRef.current) return;
      if (e.movementX) onBalanceRef.current(-e.movementX, 0);
    };
    document.addEventListener("pointerlockchange", onChange);
    document.addEventListener("mousemove", onMove);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      document.removeEventListener("mousemove", onMove);
      if (overlay && document.pointerLockElement === overlay) {
        try {
          document.exitPointerLock();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  function requestLock() {
    onEngage?.();
    const el = overlayRef.current as (HTMLDivElement & {
      requestPointerLock: (opts?: { unadjustedMovement?: boolean }) => Promise<void> | void;
    }) | null;
    if (!el || document.pointerLockElement === el) return;
    try {
      const r = el.requestPointerLock({ unadjustedMovement: true });
      if (r && typeof r.then === "function") r.catch(() => {
        try {
          el.requestPointerLock();
        } catch {
          /* preview iframes often block pointer lock */
        }
      });
    } catch {
      try {
        el.requestPointerLock();
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-6 z-10 -translate-x-1/2 bg-rw-bg/70 px-3 py-1.5 font-sans text-xs text-rw-muted">
        {locked ? "mouse locked · move to tilt" : "click to lock mouse"}
      </div>
      {warning && (
        <div className="rw-warn pointer-events-none absolute left-1/2 top-[38%] z-[30] -translate-x-1/2 text-center font-display text-2xl tracking-widest text-rw-danger">
          {warning}
        </div>
      )}
      <div
        ref={overlayRef}
        className="absolute inset-0 z-20"
        style={{ cursor: locked ? "none" : undefined }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          requestLock();
        }}
      />
    </>
  );
}


function Hud({
  distance,
  warning,
  lookHint,
  waiterConnected,
}: {
  distance: number;
  warning: string | null;
  lookHint: boolean;
  waiterConnected: boolean;
}) {
  return (
    <>
      <div className="pointer-events-none absolute left-6 top-6 z-10 font-sans text-xs tracking-widest text-rw-subtle tabular-nums">
        {distance}m
      </div>
      {lookHint && (
        <div className="pointer-events-none absolute left-1/2 top-5 z-10 -translate-x-1/2 bg-rw-bg/70 px-3 py-1.5 font-sans text-xs text-rw-muted">
          {waiterConnected
            ? "you walk and look · they keep the bowl steady"
            : "mouse locked · hold LMB to look"}
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
  hideBalance,
  onAdvance,
}: {
  onMove: (x: number, y: number) => void;
  onLook: (dx: number, dy: number) => void;
  onBalance: (dx: number, dy: number) => void;
  hideBalance?: boolean;
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
      {!hideBalance && (
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
      )}
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
