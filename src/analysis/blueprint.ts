// Blueprint de una sección: del árbol de layout medido (tree.browser.js) a
// (1) un esquema legible para el agente y (2) un componente React + Tailwind con las
// medidas reales. El texto es de relleno: se toma la ESTRUCTURA, no el copy del sitio.
import { parseColor, toHex } from "./color.js";

export interface TreeNode {
  tag: string;
  role: string;
  w: number;
  h: number;
  display: string;
  dir?: string;
  cols: number;
  gap: number;
  colGap?: number;
  align?: string;
  justify?: string;
  textAlign?: string;
  pad: number[];
  maxW: number;
  radius: number;
  bg: string;
  border: string;
  shadow?: boolean;
  color: string;
  fs: number;
  fw: number;
  ff?: string;
  lh: number;
  ls: number;
  tt?: string;
  textLen: number;
  words: number;
  children: TreeNode[];
  sectionBg?: string;
  repeat?: number;
}

const hex = (c?: string) => {
  if (!c) return "";
  const p = parseColor(c);
  return p && p.a > 0.05 ? toHex(p) : "";
};

/** Firma estructural (2 niveles): dos tarjetas con la misma firma son "la misma tarjeta". */
export function signature(n: TreeNode, depth = 2): string {
  // el texto se distingue por su tipografía: un título y su descripción NO son "dos iguales"
  const typo = ["heading", "text", "label", "button", "link"].includes(n.role) ? `:${n.fs}/${n.fw}` : "";
  const own = `${n.role}:${n.display}:${n.cols}${typo}`;
  if (depth === 0 || !n.children.length) return own;
  return `${own}[${n.children.map((c) => signature(c, depth - 1)).join(",")}]`;
}

/** Agrupa hermanos consecutivos idénticos en uno con `repeat`. */
export function compress(n: TreeNode): TreeNode {
  const kids: TreeNode[] = [];
  for (const raw of n.children) {
    const c = compress(raw);
    const prev = kids[kids.length - 1];
    if (prev && signature(prev) === signature(c)) prev.repeat = (prev.repeat ?? 1) + 1;
    else kids.push({ ...c });
  }
  return { ...n, children: kids };
}

// ---------- Tailwind ----------
const SCALE: Record<number, string> = { 0: "0", 2: "0.5", 4: "1", 6: "1.5", 8: "2", 10: "2.5", 12: "3", 14: "3.5", 16: "4", 20: "5", 24: "6", 28: "7", 32: "8", 36: "9", 40: "10", 44: "11", 48: "12", 56: "14", 64: "16", 72: "18", 80: "20", 96: "24", 112: "28", 128: "32" };
const sp = (v: number) => SCALE[v] ?? `[${v}px]`;
const WEIGHT: Record<number, string> = { 300: "font-light", 400: "font-normal", 500: "font-medium", 600: "font-semibold", 700: "font-bold", 800: "font-extrabold" };

export function tw(n: TreeNode, parentColor?: string): string[] {
  const c: string[] = [];
  const isText = ["heading", "text", "label", "link", "button"].includes(n.role);
  // layout
  if (n.display.includes("grid") && n.cols > 1) c.push("grid", "grid-cols-1", n.cols >= 3 ? "sm:grid-cols-2" : "", `md:grid-cols-${Math.min(n.cols, 6)}`);
  else if (n.display.includes("flex")) {
    if (n.dir?.startsWith("column")) c.push("flex", "flex-col");
    else c.push("flex", "flex-wrap");
    if (n.align && n.align !== "normal" && n.align !== "stretch") c.push(`items-${n.align.replace("flex-", "")}`);
    if (n.justify && /between|center|end/.test(n.justify)) c.push(`justify-${n.justify.replace("space-", "").replace("flex-", "")}`);
  } else if (n.cols > 1 && n.children.length > 1) c.push("grid", "grid-cols-1", `md:grid-cols-${Math.min(n.cols, 6)}`);
  if (n.gap > 0 && (n.display.includes("grid") || n.display.includes("flex") || n.cols > 1)) c.push(`gap-${sp(n.gap)}`);
  // caja
  const [pt, pr, pb, pl] = n.pad;
  if (pt && pt === pb) c.push(`py-${sp(pt)}`);
  else {
    if (pt) c.push(`pt-${sp(pt)}`);
    if (pb) c.push(`pb-${sp(pb)}`);
  }
  if (pl && pl === pr) c.push(`px-${sp(pl)}`);
  else {
    if (pl) c.push(`pl-${sp(pl)}`);
    if (pr) c.push(`pr-${sp(pr)}`);
  }
  if (n.maxW) c.push("mx-auto", `max-w-[${n.maxW}px]`, "w-full");
  if (n.radius) c.push(n.radius >= 999 || n.radius >= n.h / 2 ? "rounded-full" : `rounded-[${n.radius}px]`);
  const bg = hex(n.bg);
  if (bg) c.push(`bg-[${bg}]`);
  const border = hex(n.border);
  if (border) c.push("border", `border-[${border}]`);
  if (n.shadow) c.push("shadow-sm");
  if (n.textAlign === "center" && (isText || n.role === "group")) c.push("text-center");
  // tipografía (solo donde hay texto)
  if (isText) {
    c.push(`text-[${n.fs}px]`, WEIGHT[n.fw] ?? `font-[${n.fw}]`, `leading-[${n.lh}]`);
    if (Math.abs(n.ls) >= 0.005) c.push(`tracking-[${n.ls}em]`);
    if (n.tt === "uppercase") c.push("uppercase");
    const color = hex(n.color);
    if (color && color !== parentColor) c.push(`text-[${color}]`);
  }
  if (n.role === "button") c.push("inline-flex", "items-center", "justify-center");
  return c.filter(Boolean);
}

// ---------- texto de relleno ----------
const POOL = "diseña construye mide compara publica equipo producto clientes datos flujo rápido claro simple confiable proyecto ideas trabajo resultados".split(" ");
function filler(words: number, kind: string): string {
  const n = Math.max(2, Math.min(words || 4, kind === "heading" ? 9 : 28));
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(POOL[(i * 7 + n) % POOL.length]);
  const s = out.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1) + (kind === "text" ? "." : "");
}

function placeholder(n: TreeNode): string {
  switch (n.role) {
    case "heading":
      return filler(n.words, "heading");
    case "label":
      return "Etiqueta";
    case "button":
      return "Acción";
    case "link":
      return "Ver más";
    default:
      return filler(n.words, "text");
  }
}

// ---------- JSX ----------
export function toJsx(root: TreeNode, componentName = "Seccion"): string {
  const lines: string[] = [];
  const pad = (d: number) => "  ".repeat(d);
  const sectionBg = hex(root.sectionBg);
  const baseColor = hex(root.color);
  let budget = 220;

  const emit = (n: TreeNode, d: number, parentColor?: string) => {
    if (budget-- <= 0) return;
    const cls = tw(n, parentColor).join(" ");
    const attr = cls ? ` className="${cls}"` : "";
    const color = hex(n.color) || parentColor;
    const open = (inner: () => void, tag: string) => {
      lines.push(`${pad(d)}<${tag}${attr}>`);
      inner();
      lines.push(`${pad(d)}</${tag}>`);
    };
    const single = (s: string) => lines.push(`${pad(d)}${s}`);
    const body = () => {
      switch (n.role) {
        case "heading": {
          const level = n.fs >= 40 ? "h2" : n.fs >= 22 ? "h3" : "h4";
          single(`<${level}${attr}>${placeholder(n)}</${level}>`);
          return;
        }
        case "text":
        case "label":
          single(`<p${attr}>${placeholder(n)}</p>`);
          return;
        case "button":
          single(`<a href="#"${attr}>${placeholder(n)}</a>`);
          return;
        case "link":
          single(`<a href="#"${attr}>${placeholder(n)}</a>`);
          return;
        case "image":
        case "video":
          single(`<div className="w-full aspect-[${n.w}/${n.h}] ${n.radius ? `rounded-[${n.radius}px] ` : ""}bg-neutral-200/70" aria-hidden="true" />`);
          return;
        case "icon":
          single(`<span className="inline-block size-[${Math.max(12, Math.min(n.w, 32))}px] rounded bg-current opacity-20" aria-hidden="true" />`);
          return;
        case "input":
          single(`<input${attr} placeholder="tu@email.com" />`);
          return;
        default: {
          const tag = n.role === "list" ? "ul" : n.role === "form" ? "form" : "div";
          open(() => n.children.forEach((c) => emitRepeat(c, d + 1, color)), tag);
        }
      }
    };
    body();
  };

  const emitRepeat = (n: TreeNode, d: number, parentColor?: string) => {
    if (n.repeat && n.repeat > 1) {
      lines.push(`${pad(d)}{Array.from({ length: ${n.repeat} }).map((_, i) => (`);
      const start = lines.length;
      emit({ ...n, repeat: undefined }, d + 1, parentColor);
      // key en el primer elemento del bloque repetido
      lines[start] = lines[start].replace(/^(\s*<\w+)/, "$1 key={i}");
      lines.push(`${pad(d)}))}`);
    } else emit(n, d, parentColor);
  };

  const rootCls = [sectionBg ? `bg-[${sectionBg}]` : "", baseColor ? `text-[${baseColor}]` : "", "w-full"].filter(Boolean).join(" ");
  lines.push(`export function ${componentName}() {`, "  return (", `    <section className="${rootCls}">`);
  emitRepeat(root, 3, baseColor);
  lines.push("    </section>", "  );", "}");
  return lines.join("\n");
}

// ---------- esquema legible ----------
export function toOutline(root: TreeNode): string {
  const out: string[] = [];
  let budget = 120;
  const desc = (n: TreeNode): string => {
    const bits: string[] = [];
    if (n.role === "heading" || n.role === "text" || n.role === "label" || n.role === "button" || n.role === "link")
      bits.push(`${n.fs}px/${n.fw}${n.ls ? ` ${n.ls}em` : ""}${n.words ? ` · ${n.words} palabras` : ""}`);
    if (n.role === "image" || n.role === "video") bits.push(`${n.w}×${n.h}`);
    if (n.display.includes("grid") && n.cols > 1) bits.push(`grid ${n.cols} col`);
    else if (n.display.includes("flex")) bits.push(n.dir?.startsWith("column") ? "flex col" : "flex fila");
    if (n.gap) bits.push(`gap ${n.gap}`);
    if (n.pad.some((p) => p)) bits.push(`padding ${n.pad.join("/")}`);
    if (n.maxW) bits.push(`max ${n.maxW}px`);
    if (n.radius) bits.push(`radio ${n.radius >= 999 ? "pill" : n.radius}`);
    if (hex(n.bg)) bits.push(`fondo ${hex(n.bg)}`);
    if (hex(n.border)) bits.push(`borde ${hex(n.border)}`);
    return bits.join(" · ");
  };
  const walk = (n: TreeNode, prefix: string, last: boolean, depth: number) => {
    if (budget-- <= 0) return;
    const rep = n.repeat && n.repeat > 1 ? `×${n.repeat} ` : "";
    out.push(`${prefix}${depth ? (last ? "└ " : "├ ") : ""}${rep}${n.role} ${desc(n)}`.trimEnd());
    const next = prefix + (depth ? (last ? "  " : "│ ") : "");
    n.children.forEach((c, i) => walk(c, next, i === n.children.length - 1, depth + 1));
  };
  out.push(`sección · fondo ${hex(root.sectionBg) || "—"} · ${root.w}×${root.h}px`);
  walk(root, "", true, 0);
  return out.join("\n");
}

export function blueprint(tree: TreeNode, name = "Seccion") {
  const t = compress(tree);
  return { outline: toOutline(t), jsx: toJsx(t, name) };
}
