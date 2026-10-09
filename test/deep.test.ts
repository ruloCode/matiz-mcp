import { test } from "node:test";
import assert from "node:assert/strict";
import { deepForAgent, describeChange, hex } from "../src/analysis/deep.js";
import { summarizeReveal } from "../src/capture/deep.js";

test("hex convierte rgb/rgba y respeta transparente", () => {
  assert.equal(hex("rgb(0, 113, 227)"), "#0071e3");
  assert.equal(hex("rgba(0, 0, 0, 0)"), "transparent");
  assert.equal(hex("rgba(29, 29, 31, 0.8)"), "#1d1d1fcc");
  assert.equal(hex("#abcdef"), "#abcdef");
});

test("describeChange pone en palabras un hover medido", () => {
  assert.equal(describeChange({ prop: "transform", from: "none", to: "matrix(1, 0, 0, 1, 0, -2)", on: "self" }), "sube 2px");
  assert.equal(describeChange({ prop: "transform", from: "none", to: "matrix(1, 0, 0, 1, 3, 0)", on: "hijo" }), "hijo/ícono: se mueve 3px en x");
  assert.equal(describeChange({ prop: "fondo", from: "rgb(83, 58, 253)", to: "rgb(64, 50, 200)", on: "self" }), "fondo: #533afd → #4032c8");
  assert.match(describeChange({ prop: "sombra", from: "none", to: "rgba(0, 0, 0, 0.2) 0px 4px 12px 0px", on: "self" }), /^aparece sombra #00000033/);
});

test("el CSS del botón lleva su :hover medido", () => {
  const out = deepForAgent({
    buttons: [{ key: "btn-0", role: "primary", kind: "solid", count: 3, label: "Empezar", bg: "rgb(0, 113, 227)", color: "rgb(255, 255, 255)", border: "", radius: 980, pill: true, height: 44, padX: 21, fontSize: 17, weight: 400, family: "SF Pro Text", letterSpacing: -0.022, transform: "none", shadow: "", transition: "" }],
    states: [{ key: "btn-0", kind: "button", state: "hover", changes: [{ prop: "fondo", from: "rgb(0, 113, 227)", to: "rgb(0, 118, 223)", on: "self" }], waitMs: 160 }],
  });
  const css = out.components.buttons[0].css;
  assert.match(css, /background-color: #0071e3;/);
  assert.match(css, /border-radius: 999px;/);
  assert.match(css, /\.btn-primary:hover \{\n  background-color: #0076df;/);
  assert.deepEqual(out.components.buttons[0].hover, ["fondo: #0071e3 → #0076df"]);
});

test("summarizeReveal reconoce 'sube + fundido' y el escalonado", () => {
  const row = (parent: string, delay: string) => ({ tag: "div", y: 2000, parent, op: 0, dx: 0, dy: 24, sc: 1, opUp: true, moved: true, scaled: false, blur: false, clip: false, duration: "0.6s", easing: "ease-out", delay, animation: "" });
  const r = summarizeReveal({ candidates: 10, revealed: [row("a", "0s"), row("a", "0.1s"), row("a", "0.2s"), row("b", "0s")] }, []);
  assert.equal(r.revealed, 4);
  assert.equal(r.pattern, "sube + fundido");
  assert.equal(r.distance, 24);
  assert.equal(r.duration, "0.6s");
  assert.equal(r.stagger, 1);
  assert.equal(r.fromOpacity, 0);
});
