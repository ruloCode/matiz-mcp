import { test } from "node:test";
import assert from "node:assert/strict";
import { blueprint, compress, tw, type TreeNode } from "../src/analysis/blueprint.js";

const leaf = (role: string, p: Partial<TreeNode> = {}): TreeNode => ({
  tag: "div", role, w: 300, h: 24, display: "block", cols: 1, gap: 0, pad: [0, 0, 0, 0], maxW: 0, radius: 0, bg: "", border: "",
  color: "rgb(17, 17, 17)", fs: 16, fw: 400, lh: 1.5, ls: 0, textLen: 30, words: 6, children: [], ...p,
});
const card = () => leaf("card", { display: "flex", dir: "column", gap: 12, pad: [24, 24, 24, 24], radius: 16, bg: "rgb(245, 245, 245)", h: 220, children: [leaf("icon", { w: 20, h: 20 }), leaf("heading", { fs: 20, fw: 600, words: 3 }), leaf("text", { fs: 15, words: 14 })] });

test("tres tarjetas iguales se vuelven una con repeat=3; título y descripción NO se fusionan", () => {
  const grid = leaf("group", { display: "grid", cols: 3, gap: 24, children: [card(), card(), card()] });
  const c = compress(grid);
  assert.equal(c.children.length, 1);
  assert.equal(c.children[0].repeat, 3);
  assert.equal(c.children[0].children.length, 3);
});

test("clases Tailwind con las medidas reales", () => {
  const cls = tw(card());
  assert.ok(cls.includes("flex") && cls.includes("flex-col") && cls.includes("gap-3"));
  assert.ok(cls.includes("p-6") || (cls.includes("py-6") && cls.includes("px-6")));
  assert.ok(cls.includes("rounded-[16px]"));
  assert.ok(cls.includes("bg-[#F5F5F5]"));
  const grid = tw(leaf("group", { display: "grid", cols: 3, gap: 24 }));
  assert.ok(grid.includes("md:grid-cols-3") && grid.includes("gap-6"));
  const h = tw(leaf("heading", { fs: 48, fw: 600, ls: -0.03 }));
  assert.ok(h.includes("text-[48px]") && h.includes("font-semibold") && h.includes("tracking-[-0.03em]"));
});

test("el JSX usa map para lo repetido y texto de relleno (no el copy del sitio)", () => {
  const root = leaf("group", { display: "grid", cols: 3, gap: 24, sectionBg: "rgb(255,255,255)", children: [card(), card(), card()] });
  const { jsx, outline } = blueprint(root, "Beneficios");
  assert.match(jsx, /export function Beneficios\(\)/);
  assert.match(jsx, /Array\.from\(\{ length: 3 \}\)\.map/);
  assert.match(jsx, /key=\{i\}/);
  assert.match(outline, /×3 card/);
  assert.match(outline, /grid 3 col/);
});
