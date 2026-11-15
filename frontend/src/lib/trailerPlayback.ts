export type TrailerSoundStorage = Pick<Storage, "getItem" | "setItem">;

export type TrailerPlaybackControls = {
  playVideo: () => void;
  mute: () => void;
  unMute: () => void;
};

export function trailerSoundKey(userId: string) {
  return `cinerian:trailer-sound:${userId}`;
}

// Sonido encendido salvo que la persona lo haya apagado a mano.
export function readTrailerSoundPreference(storage: TrailerSoundStorage | null, userId: string) {
  if (!storage) return true;
  try { return storage.getItem(trailerSoundKey(userId)) !== "off"; }
  catch { return true; }
}

export function saveTrailerSoundPreference(storage: TrailerSoundStorage | null, userId: string, enabled: boolean) {
  if (!storage) return;
  try { storage.setItem(trailerSoundKey(userId), enabled ? "on" : "off"); }
  catch { /* La preferencia sigue activa en memoria si el almacenamiento falla. */ }
}

export function shouldRestoreTrailerSound(preferredSound: boolean, alreadyAttempted: boolean, isMuted: boolean, active: boolean) {
  return preferredSound && !alreadyAttempted && isMuted && active;
}

export function requestTrailerAutoplay(player: TrailerPlaybackControls, soundEnabled: boolean): "sound" | "muted" {
  if (soundEnabled) player.unMute();
  else player.mute();
  player.playVideo();
  return soundEnabled ? "sound" : "muted";
}

export function retryTrailerAutoplayMuted(player: TrailerPlaybackControls) {
  player.mute();
  player.playVideo();
}

export function recoverBlockedTrailerAutoplay(player: TrailerPlaybackControls, attempted: "sound" | "muted") {
  if (attempted === "muted") return "blocked" as const;
  retryTrailerAutoplayMuted(player);
  return "muted" as const;
}

export function decideTrailerAutoplayRecovery(
  signal: "blocked" | "timeout",
  attempted: "sound" | "muted",
  playerState: number
): "playing" | "retry-muted" | "unconfirmed" {
  if (playerState === 1) return "playing";
  if (playerState === 0) return "unconfirmed";
  if (attempted === "sound" && (signal === "blocked" || [-1, 2, 5].includes(playerState))) return "retry-muted";
  return "unconfirmed";
}
