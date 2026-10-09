import { test } from "node:test";
import assert from "node:assert/strict";
import { colorRole, tokensFrom, typeScaleFrom } from "../src/analysis/system.js";
import { distinctiveTraits } from "../src/analysis/uniqueness.js";
import { toCssVariables, toTailwindTheme } from "../src/analysis/exports.js";
import { buildDna } from "../src/analysis/dna.js";
import { page } from "./helpers.js";

test("rol de un token por su nombre", () => {
  assert.equal(colorRole("--color-primary"), "accent");
  assert.equal(colorRole("--background"), "background");
  assert.equal(colorRole("--text-muted"), "muted");
  assert.equal(colorRole("--border-subtle"), "border");
  assert.equal(colorRole("--destructive"), "danger");
  assert.equal(colorRole("--random-thing"), undefined);
});

test("tokens declarados: colores con rol, escalas, tamaños, fuentes y sombras", () => {
  const t = tokensFrom([
    { name: "--primary", raw: "", value: "222.2 47.4% 11.2%" },
    { name: "--background", raw: "", value: "#ffffff" },
    { name: "--blue-100", raw: "", value: "#dbeafe" },
    { name: "--blue-300", raw: "", value: "#93c5fd" },
    { name: "--blue-500", raw: "", value: "#3b82f6" },
    { name: "--blue-700", raw: "", value: "#1d4ed8" },
    { name: "--radius-lg", raw: "", value: "0.75rem" },
    { name: "--space-4", raw: "", value: "16px" },
    { name: "--font-sans", raw: "", value: '"Inter", system-ui, sans-serif' },
    { name: "--shadow-md", raw: "", value: "0 4px 6px -1px rgba(0,0,0,.1)" },
    { name: "--link", raw: "", value: "var(--primary)" },
  ]);
  assert.equal(t.colors.find((c) => c.name === "--primary")?.role, "accent");
  assert.equal(t.scales[0].name, "blue");
  assert.deepEqual(t.scales[0].steps.map((s) => s.step), ["100", "300", "500", "700"]);
  assert.deepEqual(t.sizes.find((s) => s.name === "--radius-lg"), { name: "--radius-lg", value: "0.75rem", px: 12, kind: "radius" });
  assert.equal(t.sizes.find((s) => s.name === "--space-4")?.kind, "space");
  assert.equal(t.fonts[0].name, "--font-sans");
  assert.equal(t.shadows[0].name, "--shadow-md");
  assert.ok(!t.colors.some((c) => c.name === "--link"), "las referencias var() sin resolver no se inventan");
});

test("escala tipográfica real: tamaños por uso, con rol", () => {
  const s = typeScaleFrom(page().texts, 16);
  assert.equal(s[0].size, 64);
  assert.equal(s[0].role, "display");
  assert.ok(s.some((x) => x.size === 16 && x.role === "body"));
  assert.ok(Math.abs(s.reduce((n, x) => n + x.share, 0) - 1) < 0.02);
});

test("rasgos únicos: salen de percentiles del corpus, con número", () => {
  const corpus = Array.from({ length: 20 }, (_, i) =>
    buildDna(page({ texts: page().texts.map((t) => (t.tag === "h1" ? { ...t, size: 40 + i } : t)) })),
  );
  const giant = buildDna(page({ texts: page().texts.map((t) => (t.tag === "h1" ? { ...t, size: 140, chars: 30 } : t)) }));
  const traits = distinctiveTraits(giant, corpus);
  const t = traits.find((x) => x.kind === "display");
  assert.ok(t, "detecta el display extremo");
  assert.match(t!.text, /140px/);
  assert.match(t!.text, /\d+%/);
});

test("exportes: variables CSS y tema Tailwind con roles, escala del primario y alternativa libre", () => {
  const d = buildDna(page());
  const css = toCssVariables("Ejemplo", d);
  assert.match(css, /--color-background: #FFFFFF;/);
  assert.match(css, /--color-primary: #2563EB;/);
  assert.match(css, /--color-primary-500:/);
  assert.match(css, /--font-heading: "Fraunces"/);
  const tw = toTailwindTheme("Ejemplo", d);
  assert.match(tw, /@theme \{/);
  assert.match(tw, /--color-brand-500:/);
});
