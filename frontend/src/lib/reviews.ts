import type { DiscoveryItem } from "../types";

export function buildWatchedPostBody(input: {
  item: DiscoveryItem;
  liked: boolean;
  rating: number;
  comment: string;
}) {
  const sentiment = input.liked ? "Le gusto" : "No le gusto";
  const stars = `${input.rating}/5`;
  const note = input.comment.trim();

  if (note) {
    return `${sentiment} ${input.item.title}, le dio ${stars} y dijo: "${note}"`;
  }

  return `${sentiment} ${input.item.title} y le dio ${stars}.`;
}
