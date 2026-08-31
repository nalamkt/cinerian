import type { RatedReaction } from "./reactions";
import type { DiscoveryItem } from "../types";

const SENTIMENT: Record<RatedReaction, string> = {
  superliked: "Le encanto",
  liked: "Le gusto",
  disliked: "No le gusto"
};

export function buildWatchedPostBody(input: {
  item: DiscoveryItem;
  reaction: RatedReaction;
  comment: string;
}) {
  const sentiment = SENTIMENT[input.reaction];
  const note = input.comment.trim();

  if (note) {
    return `${sentiment} ${input.item.title} y dijo: "${note}"`;
  }

  return `${sentiment} ${input.item.title}.`;
}
