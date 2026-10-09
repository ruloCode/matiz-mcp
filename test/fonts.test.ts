import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_ALTERNATIVES, fontAvailability, freeFont, normalizeFamily } from "../src/analysis/fonts.js";

test("normaliza los nombres que llegan de getComputedStyle", () => {
  assert.equal(normalizeFamily("__Inter_d65c78"), "inter");
  assert.equal(normalizeFamily("__Inter_Fallback_d65c78"), "inter");
  assert.equal(normalizeFamily("Inter Variable"), "inter");
  assert.equal(normalizeFamily("sohne-var"), "sohne");
  assert.equal(normalizeFamily("Söhne"), "sohne");
});

test("reconoce fuentes libres y propone equivalentes para las comerciales", () => {
  assert.equal(fontAvailability("Inter Variable").free, true);
  assert.equal(fontAvailability("GeistSans").freeAs, "Geist");
  assert.equal(fontAvailability("Fraunces").free, true);
  const sohne = fontAvailability("sohne-var");
  assert.equal(sohne.free, false);
  assert.deepEqual(sohne.alternatives, ["Inter", "Hanken Grotesk"]);
  assert.equal(fontAvailability("GT Super Display").alternatives?.[0], "Fraunces");
  // desconocida: cae a la clase del stack
  assert.equal(fontAvailability("MarcaPropia", "MarcaPropia, Georgia, serif").alternatives?.[0], "Fraunces");
});

test("toda alternativa propuesta existe de verdad en el catálogo libre", () => {
  const missing = ALL_ALTERNATIVES.filter((f) => !freeFont(f));
  assert.deepEqual(missing, []);
});
