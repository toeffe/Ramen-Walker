import { create } from "zustand";

export type Phase = "title" | "playing" | "ending";

export type DialogueState = {
  speaker: string;
  text: string;
  complete: boolean;
} | null;

type GameUI = {
  phase: Phase;
  ready: boolean;
  webglError: boolean;
  distance: number;
  stability: number;
  warning: string | null;
  dialogue: DialogueState;
  endingTitle: string;
  endingHtml: string;
  spilled: boolean;
  flash: number;
  whiteout: number;
  hitKind: "none" | "scare" | "death";
  hitId: number;
  lookHint: boolean;
  isCoarse: boolean;
  setReady: (v: boolean) => void;
  setWebglError: () => void;
  setPhase: (phase: Phase) => void;
  setHud: (distance: number, stability: number) => void;
  setWarning: (warning: string | null) => void;
  setDialogue: (dialogue: DialogueState) => void;
  setEnding: (title: string, html: string) => void;
  setSpilled: (spilled: boolean) => void;
  setFlash: (flash: number) => void;
  setWhiteout: (whiteout: number) => void;
  pulseHit: (kind: "none" | "scare" | "death") => void;
  setLookHint: (lookHint: boolean) => void;
  setCoarse: (isCoarse: boolean) => void;
};

export const useGame = create<GameUI>((set) => ({
  phase: "title",
  ready: false,
  webglError: false,
  distance: 0,
  stability: 100,
  warning: null,
  dialogue: null,
  endingTitle: "",
  endingHtml: "",
  spilled: false,
  flash: 0,
  whiteout: 0,
  hitKind: "none",
  hitId: 0,
  lookHint: false,
  isCoarse: false,
  setReady: (ready) => set({ ready }),
  setWebglError: () => set({ webglError: true }),
  setPhase: (phase) => set({ phase }),
  setHud: (distance, stability) => set({ distance, stability }),
  setWarning: (warning) => set({ warning }),
  setDialogue: (dialogue) => set({ dialogue }),
  setEnding: (endingTitle, endingHtml) =>
    set({ phase: "ending", endingTitle, endingHtml }),
  setSpilled: (spilled) => set({ spilled }),
  setFlash: (flash) => set({ flash }),
  setWhiteout: (whiteout) => set({ whiteout }),
  pulseHit: (hitKind) =>
    set((s) => ({ hitKind, hitId: hitKind === "none" ? s.hitId : s.hitId + 1 })),
  setLookHint: (lookHint) => set({ lookHint }),
  setCoarse: (isCoarse) => set({ isCoarse }),
}));
