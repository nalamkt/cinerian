import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const {
  assertAvatarOwner, avatarCropRect, commitAvatarChange, ownedAvatarPath, validateAvatarFile
} = await vite.ssrLoadModule("/src/lib/avatarUpload.ts");
const { EditProfileForm } = await vite.ssrLoadModule("/src/components/EditProfileForm.tsx");

const jpeg = new Uint8Array([255, 216, 255, 224, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const webp = new TextEncoder().encode("RIFF0000WEBP");
const file = (bytes, type) => new File([bytes], "avatar", { type });

test("acepta JPEG, PNG y WebP reales y rechaza MIME falso, vacío y exceso de tamaño", async () => {
  await validateAvatarFile(file(jpeg, "image/jpeg"));
  await validateAvatarFile(file(png, "image/png"));
  await validateAvatarFile(file(webp, "image/webp"));
  await assert.rejects(validateAvatarFile(file(jpeg, "image/png")), /contenido/);
  await assert.rejects(validateAvatarFile(file(jpeg, "image/gif")), /JPEG/);
  await assert.rejects(validateAvatarFile(file([], "image/jpeg")), /8 MB/);
  const huge = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "huge.jpg", { type: "image/jpeg" });
  await assert.rejects(validateAvatarFile(huge), /8 MB/);
});

test("recorta siempre un cuadrado dentro de la imagen, también con zoom y desplazamiento", () => {
  assert.deepEqual(avatarCropRect(800, 600, 1, 0, 0), { sx: 100, sy: 0, side: 600 });
  assert.deepEqual(avatarCropRect(800, 600, 2, 1, -1), { sx: 500, sy: 0, side: 300 });
});

test("solamente reconoce avatares propios del bucket y origen configurados", () => {
  const name = "f3eb31a2-e692-42dd-8e7b-cf36fe442cdc.webp";
  const origin = "https://project.supabase.co";
  const url = `${origin}/storage/v1/object/public/avatars/user-1/${name}`;
  assert.equal(ownedAvatarPath(url, "user-1", origin), `user-1/${name}`);
  assert.equal(ownedAvatarPath(url, "user-2", origin), null);
  assert.equal(ownedAvatarPath(url.replace(origin, "https://evil.test"), "user-1", origin), null);
  assert.equal(ownedAvatarPath("https://example.com/legacy.jpg", "user-1", origin), null);
});

test("no permite operar sin sesión ni con el ID de otra cuenta", () => {
  assert.doesNotThrow(() => assertAvatarOwner("user-1", "user-1"));
  assert.throws(() => assertAvatarOwner(undefined, "user-1"), /iniciar sesión/);
  assert.throws(() => assertAvatarOwner("user-2", "user-1"), /iniciar sesión/);
});

test("sube, persiste y borra la anterior sólo después del guardado; reemplazar usa URL única", async () => {
  const calls = [];
  const result = await commitAvatarChange("old", { kind: "replace", blob: new Blob(["new"], { type: "image/webp" }) }, {
    upload: async () => { calls.push("upload"); return { url: "new" }; },
    update: async (url) => { calls.push(`update:${url}`); return { avatar_url: url }; },
    remove: async (url) => { calls.push(`remove:${url}`); }
  });
  assert.deepEqual(calls, ["upload", "update:new", "remove:old"]);
  assert.equal(result.value.avatar_url, "new");
  assert.equal(result.cleanupFailed, false);
});

test("si falla el perfil, retira la subida nueva y conserva la anterior", async () => {
  const calls = [];
  await assert.rejects(commitAvatarChange("old", { kind: "replace", blob: new Blob(["new"]) }, {
    upload: async () => { calls.push("upload"); return { url: "new" }; },
    update: async () => { calls.push("update"); throw new Error("falló el perfil"); },
    remove: async (url) => { calls.push(`remove:${url}`); }
  }), /falló el perfil/);
  assert.deepEqual(calls, ["upload", "update", "remove:new"]);
});

test("eliminación y foto heredada no suben nada; error de limpieza no revierte el perfil", async () => {
  const calls = [];
  const result = await commitAvatarChange("legacy", { kind: "remove" }, {
    upload: async () => { throw new Error("no debe subir"); },
    update: async (url) => { calls.push(`update:${url}`); return { avatar_url: null }; },
    remove: async (url) => { calls.push(`remove:${url}`); throw new Error("falló limpieza"); }
  });
  assert.deepEqual(calls, ["update:", "remove:legacy"]);
  assert.equal(result.value.avatar_url, null);
  assert.equal(result.cleanupFailed, true);
});

test("el formulario ofrece selector, recorte, eliminación y conserva la foto URL existente", () => {
  globalThis.window = { location: { origin: "https://cinerian.app" } };
  const profile = {
    id: "user-1", display_name: "Mauro", username: "mauro", bio: "",
    avatar_url: "https://example.com/avatar.jpg", gender: null, birth_date: null,
    visibility_settings: { showWatchlist: true, showWatched: true },
    favorite_titles: [], featured_collections: [], current_watching: [], banner_url: null
  };
  const html = renderToStaticMarkup(createElement(EditProfileForm, { profile, onCancel: () => {}, onSaved: () => {} }));
  assert.match(html, /type="file"/);
  assert.match(html, /image\/jpeg,image\/png,image\/webp/);
  assert.match(html, /Cambiar foto/);
  assert.match(html, /Eliminar foto/);
  assert.match(html, /https:\/\/example.com\/avatar.jpg/);
  assert.doesNotMatch(html, /type="url"/);
});
