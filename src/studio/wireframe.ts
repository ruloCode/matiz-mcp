// Baja fidelidad: una secuencia de secciones → bloques grises con los tokens del tablero.
// Sirve para acordar la ESTRUCTURA (qué va y en qué orden) antes de gastar tiempo en el
// detalle. Es determinista: la misma secuencia da siempre el mismo esqueleto.
import type { SectionType } from "../types.js";

const bar = (w: string, h = "h-3") => `<div class="${h} ${w} rounded-full bg-foreground/15"></div>`;
const line = (w: string) => `<div class="h-2 ${w} rounded-full bg-foreground/10"></div>`;
const title = (w = "w-2/3", h = "h-7") => `<div class="${h} ${w} rounded-md bg-foreground/25"></div>`;
const btn = (primary = true) => `<div class="h-10 w-32 rounded-brand ${primary ? "bg-primary/80" : "border border-border"}"></div>`;
const img = (cls: string, label = "imagen") =>
  `<div class="${cls} rounded-brand border border-dashed border-foreground/25 bg-surface grid place-items-center text-[11px] font-mono text-muted">${label}</div>`;
const card = (inner: string, cls = "") => `<div class="rounded-brand border border-border bg-surface p-5 grid gap-3 content-start ${cls}">${inner}</div>`;
const para = (n = 3) => Array.from({ length: n }, (_, i) => line(i === n - 1 ? "w-2/3" : "w-full")).join("");
const head = (center = false) => `<div class="grid gap-3 ${center ? "justify-items-center text-center" : ""} max-w-2xl ${center ? "mx-auto" : ""}">${title("w-80")}${line("w-96 max-w-full")}${line("w-72 max-w-full")}</div>`;
const rep = (n: number, fn: (i: number) => string) => Array.from({ length: n }, (_, i) => fn(i)).join("");

const wrap = (type: string, inner: string, cls = "py-16") =>
  `<section data-wf="${type}" class="relative border-b border-border ${cls}"><span class="absolute left-3 top-2 text-[11px] font-mono text-muted">${type}</span><div class="mx-auto max-w-content px-6">${inner}</div></section>`;

const TEMPLATES: Record<SectionType, () => string> = {
  banner: () => wrap("banner", `<div class="flex justify-center">${line("w-80")}</div>`, "py-3 bg-surface"),
  navbar: () => wrap("navbar", `<div class="flex items-center justify-between gap-6">${bar("w-24", "h-5")}<div class="hidden md:flex gap-6">${rep(4, () => line("w-14"))}</div>${btn()}</div>`, "py-4"),
  hero: () =>
    wrap("hero", `<div class="grid md:grid-cols-2 gap-12 items-center"><div class="grid gap-5">${title("w-full", "h-10")}${title("w-3/4", "h-10")}${para(3)}<div class="flex gap-3 pt-2">${btn()}${btn(false)}</div></div>${img("aspect-[4/3] w-full", "producto / imagen")}</div>`, "py-20"),
  logos: () => wrap("logos", `<div class="grid gap-6 justify-items-center">${line("w-56")}<div class="flex flex-wrap justify-center gap-8">${rep(6, () => bar("w-24", "h-6"))}</div></div>`, "py-10"),
  features: () => wrap("features", `${head(true)}<div class="mt-10 grid md:grid-cols-3 gap-5">${rep(3, () => card(`${bar("w-8", "h-8")}${title("w-2/3", "h-5")}${para(3)}`))}</div>`),
  "feature-split": () => wrap("feature-split", `<div class="grid md:grid-cols-2 gap-12 items-center">${img("aspect-[5/4] w-full")}<div class="grid gap-4">${title("w-3/4")}${para(4)}<div class="grid gap-2 pt-2">${rep(3, () => `<div class="flex items-center gap-3">${bar("w-4", "h-4")}${line("w-56")}</div>`)}</div></div></div>`),
  bento: () =>
    wrap("bento", `${head()}<div class="mt-10 grid md:grid-cols-3 gap-5">${card(`${title("w-1/2", "h-5")}${para(2)}${img("h-40 w-full")}`, "md:col-span-2 md:row-span-2")}${card(`${title("w-2/3", "h-5")}${para(2)}`)}${card(`${title("w-2/3", "h-5")}${para(2)}`)}${card(`${title("w-1/2", "h-5")}${para(2)}`, "md:col-span-3")}</div>`),
  steps: () => wrap("steps", `${head()}<div class="mt-10 grid md:grid-cols-3 gap-8">${rep(3, (i) => `<div class="grid gap-3"><div class="h-8 w-8 rounded-full border border-border grid place-items-center text-xs font-mono text-muted">${i + 1}</div>${title("w-2/3", "h-5")}${para(3)}</div>`)}</div>`),
  stats: () => wrap("stats", `<div class="grid grid-cols-2 md:grid-cols-4 gap-8">${rep(4, () => `<div class="grid gap-2">${title("w-24", "h-9")}${line("w-28")}</div>`)}</div>`, "py-12"),
  testimonials: () => wrap("testimonials", `${head(true)}<div class="mt-10 grid md:grid-cols-3 gap-5">${rep(3, () => card(`${para(4)}<div class="flex items-center gap-3 pt-2"><div class="h-9 w-9 rounded-full bg-foreground/15"></div><div class="grid gap-2">${line("w-24")}${line("w-16")}</div></div>`))}</div>`),
  pricing: () =>
    wrap("pricing", `${head(true)}<div class="mt-10 grid md:grid-cols-3 gap-5">${rep(3, (i) => card(`${line("w-20")}${title("w-28", "h-9")}${para(2)}${btn(i === 1)}<div class="grid gap-2 pt-2">${rep(4, () => `<div class="flex items-center gap-3">${bar("w-4", "h-4")}${line("w-40")}</div>`)}</div>`, i === 1 ? "border-primary" : ""))}</div>`),
  comparison: () => wrap("comparison", `${head()}<div class="mt-8 rounded-brand border border-border overflow-hidden">${rep(5, (i) => `<div class="grid grid-cols-4 gap-4 px-5 py-4 ${i ? "border-t border-border" : "bg-surface"}">${line("w-32")}${line("w-16")}${line("w-16")}${line("w-16")}</div>`)}</div>`),
  faq: () => wrap("faq", `<div class="grid md:grid-cols-3 gap-10"><div>${title("w-48")}</div><div class="md:col-span-2 grid">${rep(5, () => `<div class="flex items-center justify-between border-b border-border py-5">${line("w-72 max-w-full")}${bar("w-4", "h-4")}</div>`)}</div></div>`),
  cta: () => wrap("cta", `<div class="rounded-brand bg-surface border border-border p-12 grid gap-5 justify-items-center text-center">${title("w-96 max-w-full", "h-9")}${line("w-80 max-w-full")}<div class="flex gap-3 pt-2">${btn()}${btn(false)}</div></div>`),
  newsletter: () => wrap("newsletter", `<div class="grid md:grid-cols-2 gap-8 items-center"><div class="grid gap-3">${title("w-64")}${line("w-72 max-w-full")}</div><div class="flex gap-3"><div class="h-10 flex-1 rounded-brand border border-border"></div>${btn()}</div></div>`, "py-12"),
  integrations: () => wrap("integrations", `${head(true)}<div class="mt-10 grid grid-cols-3 md:grid-cols-6 gap-4">${rep(12, () => `<div class="aspect-square rounded-brand border border-border bg-surface"></div>`)}</div>`),
  team: () => wrap("team", `${head()}<div class="mt-10 grid grid-cols-2 md:grid-cols-4 gap-6">${rep(4, () => `<div class="grid gap-3">${img("aspect-square w-full", "foto")}${line("w-28")}${line("w-20")}</div>`)}</div>`),
  blog: () => wrap("blog", `${head()}<div class="mt-10 grid md:grid-cols-3 gap-6">${rep(3, () => `<div class="grid gap-3">${img("aspect-video w-full")}${line("w-20")}${title("w-full", "h-5")}${para(2)}</div>`)}</div>`),
  contact: () => wrap("contact", `<div class="grid md:grid-cols-2 gap-12"><div class="grid gap-4 content-start">${title("w-64")}${para(3)}</div><div class="grid gap-4">${rep(3, () => `<div class="grid gap-2">${line("w-20")}<div class="h-10 rounded-brand border border-border"></div></div>`)}<div class="h-24 rounded-brand border border-border"></div>${btn()}</div></div>`),
  gallery: () => wrap("gallery", `<div class="grid grid-cols-2 md:grid-cols-4 gap-4">${rep(8, (i) => img(`${i % 3 === 0 ? "aspect-[3/4]" : "aspect-square"} w-full`))}</div>`),
  video: () => wrap("video", `${head(true)}<div class="mt-8">${img("aspect-video w-full", "▶ video")}</div>`),
  showcase: () => wrap("showcase", `${head(true)}<div class="mt-8">${img("aspect-[16/9] w-full", "captura del producto")}</div>`),
  footer: () => wrap("footer", `<div class="grid grid-cols-2 md:grid-cols-5 gap-8"><div class="col-span-2 grid gap-3 content-start">${bar("w-24", "h-5")}${line("w-56")}</div>${rep(3, () => `<div class="grid gap-3 content-start">${line("w-16")}${rep(4, () => line("w-24"))}</div>`)}</div><div class="mt-10 pt-6 border-t border-border flex justify-between">${line("w-40")}${line("w-24")}</div>`, "py-12 border-b-0"),
  content: () => wrap("content", `<div class="max-w-2xl grid gap-4">${title("w-80")}${para(4)}${para(3)}</div>`),
};

export const WIREFRAME_TYPES = Object.keys(TEMPLATES) as SectionType[];

export function wireframeHtml(sequence: string[]): { html: string; used: SectionType[]; unknown: string[] } {
  const used: SectionType[] = [];
  const unknown: string[] = [];
  const parts: string[] = [];
  for (const raw of sequence) {
    const t = raw.trim().toLowerCase() as SectionType;
    if (TEMPLATES[t]) {
      used.push(t);
      parts.push(TEMPLATES[t]());
    } else unknown.push(raw);
  }
  return { html: `<div class="bg-background text-foreground">\n${parts.join("\n")}\n</div>`, used, unknown };
}
