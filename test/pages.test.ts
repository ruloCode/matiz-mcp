import { test } from "node:test";
import assert from "node:assert/strict";
import { pageTypeFromUrl, pickInnerPages } from "../src/pages.js";

test("tipo de página por ruta, ignorando el prefijo de idioma", () => {
  assert.equal(pageTypeFromUrl("https://x.com/"), "home");
  assert.equal(pageTypeFromUrl("https://x.com/es-co/"), "home");
  assert.equal(pageTypeFromUrl("https://x.com/pricing"), "pricing");
  assert.equal(pageTypeFromUrl("https://x.com/es/precios"), "pricing");
  assert.equal(pageTypeFromUrl("https://x.com/blog"), "blog");
  assert.equal(pageTypeFromUrl("https://x.com/blog/un-post-largo"), undefined);
  assert.equal(pageTypeFromUrl("https://x.com/customers/acme"), "customers");
  assert.equal(pageTypeFromUrl("https://x.com/random"), undefined);
});

test("elige una página por tipo, del mismo dominio, la ruta más corta y en orden de prioridad", () => {
  const picked = pickInnerPages("https://www.acme.com/", [
    "https://acme.com/blog",
    "https://acme.com/pricing/enterprise",
    "https://www.acme.com/pricing",
    "https://other.com/pricing",
    "/about",
    "mailto:hola@acme.com",
    "https://acme.com/signup?ref=nav",
  ]);
  assert.deepEqual(
    picked.map((p) => [p.type, p.url]),
    [
      ["pricing", "https://www.acme.com/pricing"],
      ["signup", "https://acme.com/signup"],
      ["about", "https://www.acme.com/about"],
      ["blog", "https://acme.com/blog"],
    ],
  );
  assert.equal(pickInnerPages("https://acme.com", ["https://acme.com/pricing", "https://acme.com/about"], 1).length, 1);
});
