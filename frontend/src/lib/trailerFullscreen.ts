export type TrailerPresentationMode = "inline" | "immersive" | "native";

export function shouldExpandTrailerOnRotation(input: {
  wasLandscape: boolean;
  isLandscape: boolean;
  mobile: boolean;
  active: boolean;
  playing: boolean;
  hasVideo: boolean;
  dismissed: boolean;
  mode: TrailerPresentationMode;
}) {
  return !input.wasLandscape && input.isLandscape && input.mobile && input.active &&
    input.playing && input.hasVideo && !input.dismissed && input.mode === "inline";
}

export function chooseTrailerPresentation(input: {
  nativeSupported: boolean;
  userActivated: boolean;
}): Exclude<TrailerPresentationMode, "inline"> {
  return input.nativeSupported && input.userActivated ? "native" : "immersive";
}

export function shouldLeaveTrailerOnRotation(wasLandscape: boolean, isLandscape: boolean, mode: TrailerPresentationMode) {
  return wasLandscape && !isLandscape && mode !== "inline";
}
