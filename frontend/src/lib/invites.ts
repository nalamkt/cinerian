import { canUseNativeShare } from "./profileShare";
import { supabase } from "./supabase";

export const PENDING_INVITE_STORAGE_KEY = "cinerian-pending-invite-code";

export type InviteInfo = {
  code: string;
  inviterId: string;
  inviterUsername: string;
  inviterDisplayName: string;
  inviterAvatarUrl: string | null;
  redeemedBy: string | null;
};

function generateInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export function buildInviteUrl(code: string): string {
  return `${window.location.origin}/?invite=${code}`;
}

export async function createInvite(inviterId: string): Promise<{ code: string; url: string }> {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const code = generateInviteCode();

  const { error } = await supabase.from("invites").insert({
    code,
    inviter_id: inviterId
  });

  if (error) {
    throw error;
  }

  return { code, url: buildInviteUrl(code) };
}

export async function createAndShareInvite(
  inviterId: string
): Promise<"shared" | "copied" | "cancelled"> {
  const { url } = await createInvite(inviterId);
  const text = "Te invito a Cinerian, la app donde registramos lo que vimos y nos recomendamos peliculas y series.";

  if (canUseNativeShare()) {
    try {
      await navigator.share({ title: "Te invito a Cinerian", text, url });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return "copied";
  }

  if (typeof window !== "undefined") {
    window.prompt("Copia este link", url);
  }

  return "copied";
}

export async function fetchInviteByCode(code: string): Promise<InviteInfo | null> {
  if (!supabase || !code) {
    return null;
  }

  const { data, error } = await supabase
    .from("invites")
    .select("code, inviter_id, redeemed_by, profiles!invites_inviter_id_fkey(username, display_name, avatar_url)")
    .eq("code", code)
    .maybeSingle<{
      code: string;
      inviter_id: string;
      redeemed_by: string | null;
      profiles: { username: string; display_name: string; avatar_url: string | null } | null;
    }>();

  if (error) {
    throw error;
  }

  if (!data || !data.profiles) {
    return null;
  }

  return {
    code: data.code,
    inviterId: data.inviter_id,
    inviterUsername: data.profiles.username,
    inviterDisplayName: data.profiles.display_name,
    inviterAvatarUrl: data.profiles.avatar_url,
    redeemedBy: data.redeemed_by
  };
}

export async function redeemInvite(
  code: string,
  newUserId: string
): Promise<{ inviterId: string } | null> {
  if (!supabase || !code) {
    return null;
  }

  const { data, error } = await supabase
    .from("invites")
    .update({ redeemed_by: newUserId, redeemed_at: new Date().toISOString() })
    .eq("code", code)
    .is("redeemed_by", null)
    .select("inviter_id");

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return null;
  }

  return { inviterId: data[0].inviter_id as string };
}
