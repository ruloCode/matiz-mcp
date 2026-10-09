import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDna, cleanShadow } from "../src/analysis/dna.js";
import { classifySections, sectionTypeFromQuery } from "../src/analysis/sections.js";
import { classifyFamily } from "../src/analysis/typography.js";
import { aggregateComposition } from "../src/analysis/composition.js";
import { similarity, sequenceSim } from "../src/analysis/similarity.js";
import { critique } from "../src/analysis/critique.js";
import { toDesignMd, toDtcg } from "../src/analysis/designmd.js";
import { parse } from "yaml";
import { page, sec } from "./helpers.js";

test("DNA: roles de paleta, tipografía y botones salen de lo medido", () => {
  const d = buildDna(page());
  assert.equal(d.theme, "light");
  assert.equal(d.palette.background, "#FFFFFF");
  assert.equal(d.palette.text, "#111111");
  assert.equal(d.palette.accent, "#2563EB");
  assert.equal(d.typography.pairing, "serif+sans");
  assert.equal(d.typography.baseSize, 16);
  assert.equal(d.typography.label?.transform, "uppercase");
  assert.equal(d.buttons[0].kind, "primary");
  assert.equal(d.buttons[0].label, "Get started");
  assert.equal(d.spacing.base, 8);
  assert.deepEqual(d.sequence, ["navbar", "hero", "logos", "features", "cta", "footer"]);
});

test("DNA: el texto principal es el de MÁS contraste aunque el gris tenga más caracteres; radio sin píldoras", () => {
  const d = buildDna(
    page({
      rootBg: "rgb(8, 9, 10)",
      colors: [
        { c: "rgb(8, 9, 10)", prop: "bg", w: 3_000_000 },
        { c: "rgb(138, 143, 152)", prop: "text", w: 60_000 },
        { c: "rgb(247, 248, 248)", prop: "text", w: 40_000 },
      ],
      radii: { "9999": 50, "8": 20, "12": 10 },
    }),
  );
  assert.equal(d.palette.text, "#F7F8F8");
  assert.equal(d.palette.mutedText, "#8A8F98");
  assert.equal(d.shape.radius, 8);
  assert.equal(d.shape.pill, true);
});

test("clasificador: pricing exige precio Y periodo; una cifra suelta no es pricing", () => {
  const types = classifySections(
    [
      sec({ top: 0, height: 64, tag: "header", text: "Home Pricing Docs", counts: { link: 3 } }),
      sec({ top: 64, height: 700, headings: ["Hero"], headingSizes: [56], text: "Hero", counts: { heading: 1 } }),
      sec({ top: 800, height: 500, text: "$1.4T processed in 2025. 135+ currencies. 99.999% uptime", columns: 3, cards: 3 }),
      sec({ top: 1300, height: 700, headings: ["Pricing"], text: "Pricing Free $0 /mo Pro $20 /mo Team $40 per user", columns: 3, cards: 3 }),
    ],
    900,
    2000,
  ).map((c) => c.type);
  assert.deepEqual(types, ["navbar", "hero", "stats", "pricing"]);
});

test("clasificador: 'your team' no es sección de equipo y 'code reviews' no es testimonio", () => {
  const [a, b] = classifySections(
    [
      sec({ top: 2000, text: "Planning Align your team around the roadmap", columns: 2 }),
      sec({ top: 3000, text: "Ship Streamline code reviews with clear diffs", columns: 1 }),
    ],
    900,
    5000,
  );
  assert.notEqual(a.type, "team");
  assert.notEqual(b.type, "testimonials");
});

test("clasificador: faq por <details>, newsletter por email suelto, footer por ©", () => {
  const r = classifySections(
    [
      sec({ top: 0, height: 64, text: "a b c", counts: { link: 4 } }),
      sec({ top: 64, height: 700, headings: ["H"], headingSizes: [60], counts: { heading: 1 } }),
      sec({ top: 900, text: "Questions How does it work? Can I cancel? Is there a trial?", counts: { details: 4 } }),
      sec({ top: 1600, height: 300, text: "Join the newsletter", counts: { emailInput: 1, input: 1, form: 1, button: 1 } }),
      sec({ top: 1900, tag: "div", text: "© 2026 Acme. All rights reserved. Privacy", counts: { link: 9 } }),
    ],
    900,
    2400,
  ).map((c) => c.type);
  assert.deepEqual(r.slice(2), ["faq", "newsletter", "footer"]);
});

test("consulta → tipo de sección en español e inglés", () => {
  assert.equal(sectionTypeFromQuery("página de precios con 3 planes"), "pricing");
  assert.equal(sectionTypeFromQuery("preguntas frecuentes con acordeón"), "faq");
  assert.equal(sectionTypeFromQuery("hero oscuro con video"), "hero");
  assert.equal(sectionTypeFromQuery("algo bonito"), undefined);
});

test("familias tipográficas", () => {
  assert.equal(classifyFamily("Fraunces"), "serif");
  assert.equal(classifyFamily("Instrument Serif"), "serif");
  assert.equal(classifyFamily("Berkeley Mono"), "mono");
  assert.equal(classifyFamily("Inter Variable"), "sans");
  assert.equal(classifyFamily("Custom", "Custom, Georgia, serif"), "serif");
});

test("composición: presencia, orden típico y aperturas salen de las secuencias", () => {
  const r = aggregateComposition([
    { id: "a", name: "A", sequence: ["navbar", "hero", "logos", "features", "pricing", "footer"] },
    { id: "b", name: "B", sequence: ["navbar", "hero", "features", "testimonials", "footer"] },
    { id: "c", name: "C", sequence: ["navbar", "hero", "logos", "features", "cta", "footer"] },
  ]);
  assert.equal(r.sites, 3);
  assert.equal(r.types.find((t) => t.type === "hero")!.presence, 1);
  assert.equal(r.types.find((t) => t.type === "logos")!.presence, 0.67);
  assert.deepEqual(r.typicalSequence.slice(0, 2), ["navbar", "hero"]);
  assert.equal(r.typicalSequence.at(-1), "footer");
  assert.deepEqual(r.openings[0].sequence.slice(0, 1), ["hero"]);
});

test("similitud: un sitio es idéntico a sí mismo y un tema opuesto se aleja", () => {
  const light = buildDna(page());
  const dark = buildDna(page({ rootBg: "rgb(10,10,10)", colors: [{ c: "rgb(10,10,10)", prop: "bg", w: 3_000_000 }, { c: "rgb(240,240,240)", prop: "text", w: 50_000 }] }));
  assert.equal(similarity(light, light).score, 1);
  assert.ok(similarity(light, dark).score < 0.75);
  assert.equal(sequenceSim(["a", "b", "c"], ["a", "c"]), 0.8);
});

test("crítica: detecta contraste insuficiente y secciones que faltan", () => {
  const ref = buildDna(page());
  const mine = buildDna(
    page({
      colors: [{ c: "rgb(255,255,255)", prop: "bg", w: 3_000_000 }, { c: "rgb(170,170,170)", prop: "text", w: 50_000 }],
      sections: page().sections.filter((s) => !/Trusted/.test(s.text)),
    }),
  );
  const r = critique(mine, ref);
  assert.ok(r.findings.some((f) => f.area === "contrast" && f.severity === "high"));
  assert.ok(r.composition.missing.includes("logos"));
  assert.equal(r.findings[0].severity, "high");
});

test("DESIGN.md: front matter YAML válido con las secciones en el orden del spec", () => {
  const md = toDesignMd("Example", "https://example.com", buildDna(page()));
  const [, yaml, body] = md.split(/^---$/m);
  const fm = parse(yaml);
  assert.equal(fm.name, "Example");
  assert.equal(fm.colors.primary, "#2563EB");
  assert.equal(fm.typography["body-md"].fontFamily, "Inter");
  const order = ["## Overview", "## Colors", "## Typography", "## Layout", "## Elevation & Depth", "## Shapes", "## Components", "## Do's and Don'ts"];
  const pos = order.map((h) => body.indexOf(h));
  assert.ok(pos.every((p) => p >= 0));
  assert.deepEqual([...pos].sort((a, b) => a - b), pos);
  const dt = toDtcg("Example", buildDna(page()));
  assert.deepEqual((dt.color as any).primary, { $type: "color", $value: "#2563EB" });
});

test("sombras: se descartan las capas transparentes", () => {
  const s = "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(22, 22, 24, 0.16) 0px 20px 50px -12px";
  assert.equal(cleanShadow(s), "rgba(22, 22, 24, 0.16) 0px 20px 50px -12px");
});

test("comillas dentro de código no convierten una sección en testimonios", () => {
  const [r] = classifySections(
    [sec({ top: 3000, text: '{ "id": "a", "url": "b", "name": "c" } Lo que devuelve una galería', columns: 2, counts: { code: 2 } })],
    900,
    5000,
  );
  assert.notEqual(r.type, "testimonials");
});
