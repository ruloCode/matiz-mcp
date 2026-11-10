// Critica una página construida contra una referencia: hallazgos concretos con
// valores medidos de ambos lados y qué cambiar. Cero LLM: todo es medición.
import type { Dna } from "../types.js";
import { contrastRatio, deltaE, parseColor, toOklch } from "./color.js";
import { sequenceSim } from "./similarity.js";

export interface Finding {
  severity: "high" | "medium" | "low";
  area: "color" | "contrast" | "typography" | "shape" | "layout" | "composition" | "buttons";
  message: string;
  yours: string;
  reference: string;
  fix: string;
}

export interface CritiqueResult {
  findings: Finding[];
  composition: { similarity: number; missing: string[]; extra: string[] };
  summary: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function critique(target: Dna, ref: Dna, refName = "la referencia"): CritiqueResult {
  const f: Finding[] = [];
  const P = target.palette;
  const R = ref.palette;

  // contraste propio (no depende de la referencia)
  const bg = parseColor(P.background);
  const tx = parseColor(P.text);
  if (bg && tx) {
    const cr = contrastRatio(tx, bg);
    if (cr < 4.5)
      f.push({
        severity: "high",
        area: "contrast",
        message: `El texto principal no pasa WCAG AA (${cr.toFixed(2)}:1, mínimo 4.5:1).`,
        yours: `${P.text} sobre ${P.background}`,
        reference: `${R.text} sobre ${R.background}`,
        fix: "Oscurece (o aclara en tema oscuro) el color de texto hasta ≥ 4.5:1.",
      });
  }
  if (P.mutedText && bg) {
    const m = parseColor(P.mutedText)!;
    const cr = contrastRatio(m, bg);
    if (cr < 4.5)
      f.push({
        severity: "medium",
        area: "contrast",
        message: `El texto secundario queda en ${cr.toFixed(2)}:1; si lleva información, no pasa AA.`,
        yours: P.mutedText,
        reference: R.mutedText ?? "—",
        fix: "Súbelo a ≥ 4.5:1 o úsalo solo para decoración.",
      });
  }
  for (const b of target.buttons.filter((b) => b.kind === "primary")) {
    const x = parseColor(b.bg);
    const y = parseColor(b.text);
    if (x && y && x.a > 0 && contrastRatio(x, y) < 4.5)
      f.push({
        severity: "high",
        area: "buttons",
        message: `El botón primario "${b.label}" tiene contraste ${contrastRatio(x, y).toFixed(2)}:1.`,
        yours: `${b.text} sobre ${b.bg}`,
        reference: ref.buttons[0] ? `${ref.buttons[0].text} sobre ${ref.buttons[0].bg}` : "—",
        fix: "Ajusta el texto del botón o su fondo hasta ≥ 4.5:1.",
      });
  }

  // color vs referencia
  if (target.theme !== ref.theme)
    f.push({
      severity: "high",
      area: "color",
      message: `Tema ${target.theme === "dark" ? "oscuro" : "claro"} contra referencia ${ref.theme === "dark" ? "oscura" : "clara"}.`,
      yours: P.background,
      reference: R.background,
      fix: `Si buscas el look de ${refName}, cambia la base a ${R.background}.`,
    });
  else if (bg && parseColor(R.background) && deltaE(bg, parseColor(R.background)!) > 0.04) {
    const a = toOklch(bg);
    const b = toOklch(parseColor(R.background)!);
    const warmth = b.C > a.C + 0.01 ? " (la referencia usa un neutro con tinte)" : "";
    f.push({
      severity: "low",
      area: "color",
      message: `El fondo se aleja del de la referencia${warmth}.`,
      yours: P.background,
      reference: R.background,
      fix: `Prueba ${R.background} como fondo.`,
    });
  }
  if (R.accent && !P.accent)
    f.push({
      severity: "medium",
      area: "color",
      message: "Tu página no tiene un acento claro; la referencia sí.",
      yours: "sin acento",
      reference: R.accent,
      fix: `Define un único acento (p. ej. ${R.accent}) y úsalo solo para acciones.`,
    });
  else if (R.accent && P.accent) {
    const d = deltaE(parseColor(P.accent)!, parseColor(R.accent)!);
    if (d > 0.12)
      f.push({
        severity: "low",
        area: "color",
        message: "El acento es de otra familia de color que el de la referencia.",
        yours: P.accent,
        reference: R.accent,
        fix: "Está bien si es tu marca; si no, acércalo a la referencia.",
      });
  }
  const chromaCount = (d: Dna) => d.palette.swatches.filter((s) => s.family !== "neutral" && s.weight >= 0.02).length;
  if (chromaCount(target) > chromaCount(ref) + 2)
    f.push({
      severity: "medium",
      area: "color",
      message: `Usas ${chromaCount(target)} colores con presencia; la referencia, ${chromaCount(ref)}.`,
      yours: target.palette.swatches.filter((s) => s.family !== "neutral").map((s) => s.hex).join(", "),
      reference: ref.palette.swatches.filter((s) => s.family !== "neutral").map((s) => s.hex).join(", ") || "neutros",
      fix: "Reduce a neutros + 1 acento; mueve el resto a estados (éxito/error).",
    });

  // tipografía
  const T = target.typography;
  const RT = ref.typography;
  if (T.pairing !== RT.pairing)
    f.push({
      severity: "medium",
      area: "typography",
      message: `Combinación tipográfica distinta: ${T.pairing} vs ${RT.pairing}.`,
      yours: [T.heading?.family, T.body?.family].filter(Boolean).join(" / "),
      reference: [RT.heading?.family, RT.body?.family].filter(Boolean).join(" / "),
      fix: `Para acercarte: títulos en ${RT.heading?.family ?? "—"}, texto en ${RT.body?.family ?? "—"} (o equivalentes libres).`,
    });
  if (Math.abs(T.baseSize - RT.baseSize) >= 2)
    f.push({
      severity: "low",
      area: "typography",
      message: `Tamaño base ${T.baseSize}px vs ${RT.baseSize}px.`,
      yours: `${T.baseSize}px`,
      reference: `${RT.baseSize}px`,
      fix: `Usa ${RT.baseSize}px como base.`,
    });
  const tDisp = T.display?.size ?? 0;
  const rDisp = RT.display?.size ?? 0;
  if (tDisp && rDisp && Math.abs(Math.log(tDisp / rDisp)) > 0.25)
    f.push({
      severity: "medium",
      area: "typography",
      message: `El titular más grande mide ${Math.round(tDisp)}px; en la referencia, ${Math.round(rDisp)}px.`,
      yours: `${Math.round(tDisp)}px / peso ${T.display?.weight}`,
      reference: `${Math.round(rDisp)}px / peso ${RT.display?.weight} / tracking ${RT.display?.letterSpacing}em`,
      fix: `Lleva el display a ~${Math.round(rDisp)}px${RT.display && RT.display.letterSpacing < -0.01 ? ` con tracking ${RT.display.letterSpacing}em` : ""}.`,
    });

  // forma
  const rr = (d: Dna) => (d.shape.radius >= 999 ? "pill" : `${d.shape.radius}px`);
  if (Math.abs(target.shape.radius - ref.shape.radius) >= 6 && !(target.shape.radius >= 999 && ref.shape.radius >= 999))
    f.push({
      severity: "low",
      area: "shape",
      message: `Radio típico ${rr(target)} vs ${rr(ref)}.`,
      yours: rr(target),
      reference: rr(ref),
      fix: `Unifica radios en ${rr(ref)}${ref.shape.scale.length ? ` (escala de referencia: ${ref.shape.scale.join(", ")}px)` : ""}.`,
    });
  if (target.shape.shadows !== ref.shape.shadows)
    f.push({
      severity: "low",
      area: "shape",
      message: `Sombras: ${target.shape.shadows} vs ${ref.shape.shadows}.`,
      yours: target.shape.shadowSamples[0] ?? target.shape.shadows,
      reference: ref.shape.shadowSamples[0] ?? ref.shape.shadows,
      fix: ref.shape.shadows === "none" ? "Quita sombras; separa con borde 1px o cambio de superficie." : `Usa una sombra tipo: ${ref.shape.shadowSamples[0]}`,
    });

  // layout
  const tw = target.layout.contentWidth;
  const rw = ref.layout.contentWidth;
  if (tw && rw && Math.abs(tw - rw) > 120)
    f.push({
      severity: "low",
      area: "layout",
      message: `Ancho de contenido ${tw}px vs ${rw}px.`,
      yours: `${tw}px`,
      reference: `${rw}px`,
      fix: `max-width ≈ ${rw}px.`,
    });
  if (target.layout.density !== ref.layout.density)
    f.push({
      severity: "low",
      area: "layout",
      message: `Densidad ${target.layout.density} vs ${ref.layout.density}.`,
      yours: `${target.layout.avgSectionHeight}px por sección`,
      reference: `${ref.layout.avgSectionHeight}px por sección`,
      fix: ref.layout.density === "airy" ? "Más aire: sube el padding vertical de secciones y reduce texto." : "Compacta: menos padding y más contenido por pantallazo.",
    });

  // composición
  const ts = new Set(target.sequence);
  const rs = new Set(ref.sequence);
  const missing = [...rs].filter((t) => !ts.has(t) && !["content", "banner"].includes(t));
  const extra = [...ts].filter((t) => !rs.has(t) && !["content", "banner"].includes(t));
  const sim = sequenceSim(target.sequence, ref.sequence);
  if (missing.length)
    f.push({
      severity: missing.some((m) => ["hero", "cta", "pricing"].includes(m)) ? "medium" : "low",
      area: "composition",
      message: `La referencia tiene secciones que tú no: ${missing.join(", ")}.`,
      yours: target.sequence.join(" → "),
      reference: ref.sequence.join(" → "),
      fix: `Evalúa agregar ${missing.join(", ")} en el orden de la referencia.`,
    });

  const order = { high: 0, medium: 1, low: 2 };
  f.sort((a, b) => order[a.severity] - order[b.severity]);
  const highs = f.filter((x) => x.severity === "high").length;
  return {
    findings: f,
    composition: { similarity: +sim.toFixed(2), missing, extra },
    summary: `${f.length} hallazgos (${highs} altos). Composición parecida en ${pct(sim)}.`,
  };
}
