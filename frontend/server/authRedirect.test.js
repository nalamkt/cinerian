import assert from "node:assert/strict";
import test from "node:test";
import { authRedirectUrl } from "../src/lib/authRedirect.ts";

test("login en producción vuelve al dominio de producción", () => {
  assert.equal(authRedirectUrl({ origin: "https://cinerian.app", protocol: "https:", hostname: "cinerian.app" }), "https://cinerian.app");
});

test("login y recuperación de acceso por enlace vuelven al mismo Preview", () => {
  const preview = "https://cinerian-git-preview-etapa-2-equipo.vercel.app";
  assert.equal(authRedirectUrl({ origin: preview, protocol: "https:", hostname: "cinerian-git-preview-etapa-2-equipo.vercel.app" }), preview);
  const anotherPreview = "https://cinerian-git-otra-rama-equipo.vercel.app";
  assert.equal(authRedirectUrl({ origin: anotherPreview, protocol: "https:", hostname: "cinerian-git-otra-rama-equipo.vercel.app" }), anotherPreview);
});

test("localhost conserva su origen y un HTTP ajeno no se usa como callback", () => {
  assert.equal(authRedirectUrl({ origin: "http://localhost:5173", protocol: "http:", hostname: "localhost" }), "http://localhost:5173");
  assert.equal(authRedirectUrl({ origin: "http://example.com", protocol: "http:", hostname: "example.com" }), "https://cinerian.app");
});
