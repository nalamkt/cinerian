import type { Session } from "@supabase/supabase-js";
import type { Profile } from "./auth";

export type AppView = "feed" | "search" | "recommendations" | "inbox" | "user";

export type ProductFeature =
  | AppView
  | "editorial"
  | "premieres";

type AccessControlInput = {
  session: Session | null;
  profile: Profile | null;
  enabledFeatureOverrides?: ProductFeature[] | null;
};

type AccessControl = {
  isInternalUser: boolean;
  canAccessAdminPanel: boolean;
  enabledPublicFeatures: ProductFeature[];
  canAccessFeature: (feature: ProductFeature) => boolean;
  canAccessView: (view: AppView) => boolean;
};

const ALL_FEATURES: ProductFeature[] = [
  "feed",
  "search",
  "recommendations",
  "inbox",
  "user",
  "editorial",
  "premieres"
];

function parseCsvEnv(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

function normalizeFeature(value: string): ProductFeature | null {
  return ALL_FEATURES.includes(value as ProductFeature) ? (value as ProductFeature) : null;
}

function resolveEnabledPublicFeatures() {
  const configured = [...parseCsvEnv(import.meta.env.VITE_PUBLIC_MVP_FEATURES)]
    .map(normalizeFeature)
    .filter((feature): feature is ProductFeature => Boolean(feature));

  return configured.length ? configured : ALL_FEATURES;
}

function resolveIsInternalUser(input: AccessControlInput) {
  const allowedEmails = parseCsvEnv(import.meta.env.VITE_INTERNAL_ACCESS_EMAILS);
  const allowedUsernames = parseCsvEnv(import.meta.env.VITE_INTERNAL_ACCESS_USERNAMES);
  const allowedUserIds = parseCsvEnv(import.meta.env.VITE_INTERNAL_ACCESS_USER_IDS);

  const email = input.session?.user.email?.trim().toLowerCase() ?? "";
  const username = input.profile?.username?.trim().toLowerCase() ?? "";
  const userId = input.session?.user.id?.trim().toLowerCase() ?? "";

  return (
    (email.length > 0 && allowedEmails.has(email)) ||
    (username.length > 0 && allowedUsernames.has(username)) ||
    (userId.length > 0 && allowedUserIds.has(userId))
  );
}

export function getAccessControl(input: AccessControlInput): AccessControl {
  const enabledPublicFeatures = input.enabledFeatureOverrides
    ? Array.from(new Set<ProductFeature>(["user", ...input.enabledFeatureOverrides]))
    : resolveEnabledPublicFeatures();
  const enabledFeatureSet = new Set(enabledPublicFeatures);
  const isInternalUser = resolveIsInternalUser(input);

  function canAccessFeature(feature: ProductFeature) {
    return enabledFeatureSet.has(feature);
  }

  return {
    isInternalUser,
    canAccessAdminPanel: isInternalUser,
    enabledPublicFeatures,
    canAccessFeature,
    canAccessView: (view) => canAccessFeature(view)
  };
}
