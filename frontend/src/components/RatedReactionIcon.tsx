import type { RatedReaction } from "../lib/reactions";

export const RATED_REACTION_LABELS: Record<RatedReaction, string> = {
  disliked: "No me gustó",
  liked: "Me gustó",
  superliked: "Me encantó"
};

const THUMB_UP_PATH =
  "M7 10v10M7 10l3.5-6a2.5 2.5 0 0 1 2.4 3.2L12 10h6a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 16.8 20H7";

export function getRatedReactionLabel(reaction?: RatedReaction | null, fallback = "Ya la vi") {
  return reaction ? RATED_REACTION_LABELS[reaction] : fallback;
}

/** Preserves the user's exact rating instead of reducing it to a generic watched state. */
export function RatedReactionIcon({ reaction }: { reaction?: RatedReaction | null }) {
  if (!reaction) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }

  return (
    <span className="rated-reaction-icon" aria-hidden="true">
      {Array.from({ length: reaction === "superliked" ? 2 : 1 }, (_, index) => (
        <svg key={index} viewBox="0 0 24 24" className={reaction === "disliked" ? "is-disliked" : ""}>
          <path d={THUMB_UP_PATH} />
        </svg>
      ))}
    </span>
  );
}
