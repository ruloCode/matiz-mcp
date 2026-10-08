import { test, before } from "node:test";
import assert from "node:assert/strict";
import { useMemoryDb, saveSite } from "../src/db.js";
import { buildDna } from "../src/analysis/dna.js";
import { search, buildFtsQuery } from "../src/search.js";
import { remember, tasteProfile } from "../src/taste.js";
import { page, sec } from "./helpers.js";
import type { SiteRecord } from "../src/types.js";

function rec(id: string, raw = page(), extra: Partial<SiteRecord> = {}): SiteRecord {
  const dna = buildDna(raw);
  return { id, url: `https://${id}`, name: id, title: raw.title, description: raw.description, capturedAt: new Date().toISOString(), tags: [], industry: dna.industry, dna, shots: {}, ...extra };
}

before(() => {
  useMemoryDb();
  saveSite(rec("light.dev"));
  saveSite(
    rec("dark.dev", page({ rootBg: "rgb(8,8,8)", colors: [{ c: "rgb(8,8,8)", prop: "bg", w: 3e6 }, { c: "rgb(240,240,240)", prop: "text", w: 5e4 }] })),
  );
  saveSite(
    rec(
      "pricey.io",
      page({
        sections: [
          sec({ top: 0, height: 64, tag: "header", text: "Home Pricing Docs", counts: { link: 3 } }),
          sec({ top: 64, height: 700, headings: ["Simple pricing"], headingSizes: [56], text: "Simple pricing", counts: { heading: 1 } }),
          sec({ top: 800, height: 700, headings: ["Plans"], text: "Plans Free $0 /mo Pro $20 /mo Team $40 per user", columns: 3, cards: 3 }),
        ],
      }),
      { tags: ["fintech"] },
    ),
  );
});

test("la consulta FTS traduce términos y agrega el tipo inferido", () => {
  const q = buildFtsQuery("página de precios oscuro");
  assert.match(q, /"precios"\*/);
  assert.match(q, /"pricing"\*/);
  assert.match(q, /"dark"\*/);
  assert.doesNotMatch(q, /"de"\*/);
});

test("busca secciones por tipo en español", () => {
  const r = search({ query: "precios con tres planes" });
  assert.equal(r.inferredType, "pricing");
  assert.equal(r.hits[0].refId, "pricey.io#2");
  assert.equal(r.hits[0].sectionType, "pricing");
});

test("filtra por tema y no repite el mismo sitio más de 2 veces", () => {
  const r = search({ query: "build faster platform", kind: "site", theme: "dark" });
  assert.equal(r.hits[0].siteId, "dark.dev");
  const all = search({ query: "build", kind: "section", limit: 20 });
  const per = new Map<string, number>();
  for (const h of all.hits) per.set(h.siteId, (per.get(h.siteId) ?? 0) + 1);
  assert.ok([...per.values()].every((n) => n <= 2));
});

test("el gusto del proyecto mueve el ranking y arma un perfil", () => {
  const before = search({ query: "build faster platform", kind: "site", project: "p1" }).hits.map((h) => h.siteId);
  remember("p1", "like", "dark.dev", "me gusta el contraste");
  remember("p1", "rule", undefined, "sin gradientes");
  const after = search({ query: "build faster platform", kind: "site", project: "p1" }).hits.map((h) => h.siteId);
  assert.equal(after[0], "dark.dev");
  assert.ok(before.length === after.length);
  const prof = tasteProfile("p1");
  assert.equal(prof.rules[0].note, "sin gradientes");
  assert.equal(prof.traits!.theme[0].value, "dark");
});
