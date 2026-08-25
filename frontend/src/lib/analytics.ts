import { supabase } from "./supabase";
import type { ProductFeature } from "./access";

export type ProductEventName =
  | "profile_created"
  | "auth_magic_link_requested"
  | "auth_google_started"
  | "reaction_saved"
  | "feed_post_created"
  | "feed_comment_created"
  | "recommendation_sent"
  | "profile_opened"
  | "view_session_recorded";

export async function trackProductEvent(input: {
  eventName: ProductEventName;
  userId?: string | null;
  featureKey?: ProductFeature | null;
  metadata?: Record<string, unknown>;
}) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("product_events").insert({
    event_name: input.eventName,
    user_id: input.userId ?? null,
    feature_key: input.featureKey ?? null,
    metadata: input.metadata ?? {}
  });

  if (error) {
    const haystack = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
    if (haystack.includes("product_events") && (haystack.includes("does not exist") || haystack.includes("schema cache"))) {
      return;
    }

    throw error;
  }
}
