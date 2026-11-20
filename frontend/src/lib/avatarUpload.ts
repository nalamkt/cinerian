import { supabase } from "./supabase";

export const AVATAR_INPUT_LIMIT = 8 * 1024 * 1024;
export const AVATAR_OUTPUT_LIMIT = 1024 * 1024;
export const AVATAR_SIZE = 512;

const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes) => [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte),
  "image/webp": (bytes) => String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
};

export async function validateAvatarFile(file: File): Promise<void> {
  if (!signatures[file.type]) throw new Error("Elegí una imagen JPEG, PNG o WebP.");
  if (!file.size || file.size > AVATAR_INPUT_LIMIT) throw new Error("La imagen debe pesar menos de 8 MB.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (bytes.length < 12 || !signatures[file.type](bytes)) throw new Error("El contenido del archivo no coincide con una imagen válida.");
}

export function avatarCropRect(width: number, height: number, zoom: number, x: number, y: number) {
  const side = Math.min(width, height) / Math.max(1, Math.min(zoom, 3));
  return {
    sx: (width - side) * (Math.max(-1, Math.min(x, 1)) + 1) / 2,
    sy: (height - side) * (Math.max(-1, Math.min(y, 1)) + 1) / 2,
    side
  };
}

export function drawAvatarCrop(canvas: HTMLCanvasElement, image: HTMLImageElement, zoom: number, x: number, y: number) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Este navegador no permite recortar imágenes.");
  const { sx, sy, side } = avatarCropRect(image.naturalWidth, image.naturalHeight, zoom, x, y);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
}

export async function exportAvatarCrop(image: HTMLImageElement, zoom: number, x: number, y: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  drawAvatarCrop(canvas, image, zoom, x, y);
  for (const quality of [0.86, 0.72, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.type !== "image/webp") throw new Error("Este navegador no pudo preparar la foto en WebP.");
    if (blob.size <= AVATAR_OUTPUT_LIMIT) return blob;
  }
  throw new Error("La foto optimizada todavía supera 1 MB. Probá con otra imagen.");
}

export function ownedAvatarPath(url: string | null | undefined, userId: string, origin: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const prefix = `/storage/v1/object/public/avatars/${userId}/`;
    const fileName = parsed.pathname.startsWith(prefix) ? parsed.pathname.slice(prefix.length) : "";
    return parsed.origin === new URL(origin).origin && /^[a-f0-9-]{36}\.webp$/i.test(fileName)
      ? `${userId}/${fileName}`
      : null;
  } catch {
    return null;
  }
}

export function assertAvatarOwner(authenticatedUserId: string | undefined, userId: string): void {
  if (!authenticatedUserId || authenticatedUserId !== userId) {
    throw new Error("Volvé a iniciar sesión para cambiar tu foto.");
  }
}

async function authenticatedClient(userId: string) {
  if (!supabase) throw new Error("La subida de fotos no está disponible en este momento.");
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error("Volvé a iniciar sesión para cambiar tu foto.");
  assertAvatarOwner(data.user?.id, userId);
  return supabase;
}

export async function uploadAvatar(userId: string, blob: Blob) {
  const client = await authenticatedClient(userId);
  if (blob.type !== "image/webp" || !blob.size || blob.size > AVATAR_OUTPUT_LIMIT) {
    throw new Error("La foto preparada no cumple los límites de subida.");
  }
  const path = `${userId}/${crypto.randomUUID()}.webp`;
  const { error } = await client.storage.from("avatars").upload(path, blob, {
    contentType: "image/webp", cacheControl: "31536000", upsert: false
  });
  if (error) throw new Error(`No pude subir la foto: ${error.message}`);
  return { path, url: client.storage.from("avatars").getPublicUrl(path).data.publicUrl };
}

export async function removeOwnedAvatar(userId: string, url: string | null | undefined): Promise<boolean> {
  const path = ownedAvatarPath(url, userId, import.meta.env.VITE_SUPABASE_URL as string);
  if (!path) return false;
  const client = await authenticatedClient(userId);
  const { error } = await client.storage.from("avatars").remove([path]);
  if (error) throw new Error(`No pude retirar la foto anterior: ${error.message}`);
  return true;
}

type AvatarSaveOperations<T> = {
  upload: (blob: Blob) => Promise<{ url: string }>;
  update: (url: string) => Promise<T>;
  remove: (url: string) => Promise<unknown>;
};

export async function commitAvatarChange<T>(
  previousUrl: string,
  change: { kind: "keep" } | { kind: "remove" } | { kind: "replace"; blob: Blob },
  operations: AvatarSaveOperations<T>
): Promise<{ value: T; cleanupFailed: boolean }> {
  const uploaded = change.kind === "replace" ? await operations.upload(change.blob) : null;
  const nextUrl = change.kind === "remove" ? "" : uploaded?.url ?? previousUrl;
  let value: T;
  try {
    value = await operations.update(nextUrl);
  } catch (error) {
    if (uploaded) {
      try { await operations.remove(uploaded.url); } catch { /* El perfil conserva el avatar anterior. */ }
    }
    throw error;
  }
  let cleanupFailed = false;
  if (change.kind !== "keep" && previousUrl) {
    try { await operations.remove(previousUrl); } catch { cleanupFailed = true; }
  }
  return { value, cleanupFailed };
}
