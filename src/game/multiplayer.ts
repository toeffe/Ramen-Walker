import { joinRoom, type Room } from "@trystero-p2p/nostr";
import type { CoopSnapshot } from "@/game/engine";

// Namespaces this game's rooms from any other Trystero app that might
// happen to pick the same room code on the same public relays.
const APP_ID = "ramen-walker-coop-v1";

// Trystero needs a few public Nostr relays to introduce the two browsers.
// The library's default list is long and includes hosts that are often
// down (Firefox then spams wss:// errors). Use a short known-good set.
const RELAY_URLS = [
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://nostr.data.haus",
  "wss://relay.primal.net",
  "wss://offchain.pub",
  "wss://yabu.me/v2",
];

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity

export function generateRoomCode(length = 5): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export function getLobbyUrlCode(): string | null {
  try {
    const code = new URL(location.href).searchParams.get("lobby");
    if (!code) return null;
    const clean = String(code)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 5);
    return clean.length === 5 ? clean : null;
  } catch {
    return null;
  }
}

export function setLobbyUrl(code: string | null) {
  try {
    const url = new URL(location.href);
    if (code) url.searchParams.set("lobby", code.toUpperCase());
    else url.searchParams.delete("lobby");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch {
    /* ignore */
  }
}

export function shareUrlForCode(code: string): string {
  const url = new URL(location.href);
  url.searchParams.set("lobby", code.toUpperCase());
  return url.toString();
}

// --- wire messages -------------------------------------------------------
//
// Host (Walker) is authoritative: it runs the real physics (which relies
// on Math.random(), so two independent sims would desync within
// seconds) and streams a compact state snapshot every frame. The Guest
// (Waiter) is a thin client: it only sends tray-tilt deltas and renders
// whatever state it's told.

export type WaiterInput = { dx: number; dy: number };

export type HostState = CoopSnapshot;

export type CoopRoom = {
  room: Room;
  isHost: boolean;
  sendWaiterInput: (input: WaiterInput) => Promise<void>;
  sendHostState: (state: HostState) => Promise<void>;
  onWaiterInput: (cb: (input: WaiterInput, peerId: string) => void) => void;
  onHostState: (cb: (state: HostState, peerId: string) => void) => void;
  onPeerJoin: (cb: (peerId: string) => void) => void;
  onPeerLeave: (cb: (peerId: string) => void) => void;
  leave: () => void;
};

export function connectCoopRoom(code: string, isHost: boolean): CoopRoom {
  const room = joinRoom(
    {
      appId: APP_ID,
      relayConfig: { urls: RELAY_URLS, warnOnRelayFailure: false },
    },
    code.toUpperCase(),
  );

  const waiterInputAction = room.makeAction<WaiterInput>("waiterInput");
  const hostStateAction = room.makeAction<HostState>("hostState");

  return {
    room,
    isHost,
    sendWaiterInput: (input) => waiterInputAction.send(input),
    sendHostState: (state) => hostStateAction.send(state),
    onWaiterInput: (cb) => {
      waiterInputAction.onMessage = (data, ctx) => cb(data, ctx.peerId);
    },
    onHostState: (cb) => {
      hostStateAction.onMessage = (data, ctx) => cb(data, ctx.peerId);
    },
    onPeerJoin: (cb) => {
      room.onPeerJoin = cb;
    },
    onPeerLeave: (cb) => {
      room.onPeerLeave = cb;
    },
    leave: () => {
      void room.leave();
    },
  };
}

