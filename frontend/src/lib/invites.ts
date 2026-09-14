import { canUseNativeShare } from "./profileShare";
import { supabase } from "./supabase";

export const PENDING_INVITE_STORAGE_KEY = "cinerian-pending-invite-code";

function getInviteOrigin() {
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return window.location.origin;
  }

  return "https://cinerian.app";
}

function generateInviteCode() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export async function createAndShareInvite(inviterId: string): Promise<"shared" | "copied" | "cancelled"> {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const code = generateInviteCode();
  const { error } = await supabase.from("invites").insert({ code, inviter_id: inviterId });
  if (error) {
    throw error;
  }

  const url = `${getInviteOrigin()}/?invite=${code}`;
  const text = "Te invito a Cinerian, la app para registrar lo que viste y descubrir que mirar.";

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

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return "copied";
  }

  window.prompt("Copia este link", url);
  return "copied";
}

export async function redeemInvite(code: string, userId: string): Promise<string | null> {
  if (!supabase || !code) {
    return null;
  }

  const { data, error } = await supabase
    .from("invites")
    .update({ redeemed_by: userId, redeemed_at: new Date().toISOString() })
    .eq("code", code)
    .is("redeemed_by", null)
    .select("inviter_id");

  if (error) {
    throw error;
  }

  return data?.[0]?.inviter_id ?? null;
}
