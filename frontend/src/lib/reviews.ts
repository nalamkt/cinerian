import type { DiscoveryItem } from "../types";

export function buildWatchedPostBody(input: {
  item: DiscoveryItem;
  liked: boolean;
  comment: string;
}) {
  const sentiment = input.liked ? "Le gusto" : "No le gusto";
  const note = input.comment.trim();

  if (note) {
    return `${sentiment} ${input.item.title} y dijo: "${note}"`;
  }

  return `${sentiment} ${input.item.title}.`;
}
