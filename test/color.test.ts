import { test } from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, deltaE, nameColor, parseColor, toHex, tonalScale, clusterColors } from "../src/analysis/color.js";

test("parsea los formatos que devuelve getComputedStyle", () => {
  assert.equal(toHex(parseColor("rgb(37, 99, 235)")!), "#2563EB");
  assert.equal(parseColor("rgba(0, 0, 0, 0)")!.a, 0);
  assert.equal(toHex(parseColor("#fff")!), "#FFFFFF");
  // oklch de Tailwind v4 (blue-600) cae cerca del hex equivalente
  const tw = parseColor("oklch(0.546 0.245 262.881)")!;
  assert.ok(deltaE(tw, parseColor("#155DFC")!) < 0.02, toHex(tw));
  assert.ok(deltaE(parseColor("color(srgb 1 0 0)")!, parseColor("#ff0000")!) < 0.01);
  assert.ok(deltaE(parseColor("lab(50 0 0)")!, parseColor("#777777")!) < 0.02);
  assert.equal(parseColor("nonsense"), null);
});

test("contraste WCAG conocido", () => {
  assert.equal(contrastRatio(parseColor("#000")!, parseColor("#fff")!).toFixed(1), "21.0");
  assert.ok(contrastRatio(parseColor("#777")!, parseColor("#fff")!) < 4.5);
});

test("nombra colores en es/en y detecta neutros con temperatura", () => {
  assert.equal(nameColor(parseColor("#2563EB")!).family, "blue");
  assert.equal(nameColor(parseColor("#FFFFFF")!).en, "white");
  assert.equal(nameColor(parseColor("#F7F5F2")!).neutral, true);
  assert.match(nameColor(parseColor("#F7F3EA")!).en, /warm/);
});

test("agrupa muestras casi iguales y ordena por peso", () => {
  const c = clusterColors([
    { rgb: parseColor("#ffffff")!, w: 10 },
    { rgb: parseColor("#fefefe")!, w: 5 },
    { rgb: parseColor("#2563eb")!, w: 3 },
  ]);
  assert.equal(c.length, 2);
  assert.equal(c[0].hex, "#FFFFFF");
  assert.equal(c[0].weight, +(15 / 18).toFixed(4));
});

test("escala tonal: 11 pasos de claro a oscuro", () => {
  const s = tonalScale(parseColor("#2563EB")!);
  assert.equal(Object.keys(s).length, 11);
  const L = (h: string) => contrastRatio(parseColor(h)!, parseColor("#000")!);
  assert.ok(L(s["50"]) > L(s["500"]) && L(s["500"]) > L(s["950"]));
});

test("entiende hsl() y los canales HSL sueltos de shadcn/ui", () => {
  assert.equal(toHex(parseColor("hsl(0 100% 50%)")!), "#FF0000");
  assert.equal(toHex(parseColor("hsl(210, 40%, 96%)")!), "#F1F5F9");
  assert.equal(toHex(parseColor("222.2 84% 4.9%")!), "#020817");
  assert.equal(parseColor("12px"), null);
});
