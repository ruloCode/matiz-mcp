// Contratos compartidos. Raw* = lo que devuelve el extractor del navegador (sin interpretar);
// Dna = la lectura de diseño que se guarda, se busca y se compara.

export interface RawTextSample {
  family: string;
  stack: string;
  size: number;
  weight: number;
  lh: number; // line-height relativo al tamaño
  ls: number; // letter-spacing en em
  tt: string; // text-transform
  tag: string; // h1..h6 o ""
  chars: number;
  top: number;
}

export interface RawButton {
  bg: string;
  color: string;
  border: string;
  radius: number;
  px: number;
  py: number;
  family: string;
  size: number;
  weight: number;
  text: string;
  top: number;
  count: number;
}

export interface RawSectionCounts {
  img: number;
  smallImg: number;
  svg: number;
  video: number;
  iframe: number;
  button: number;
  link: number;
  input: number;
  emailInput: number;
  textarea: number;
  form: number;
  li: number;
  table: number;
  heading: number;
  details: number;
  expanders: number;
  blockquote: number;
  code: number;
  canvas: number;
  article: number;
  time: number;
}

export interface RawSection {
  idx: number;
  tag: string;
  id: string;
  cls: string;
  top: number;
  height: number;
  width: number;
  headings: string[];
  headingSizes: number[];
  text: string;
  textLength: number;
  counts: RawSectionCounts;
  columns: number;
  cards: number;
  layout: string; // display del bloque: grid/flex/block
  textAlign: string;
  bg: string;
  bgImage: boolean;
  position: string;
}

export interface RawBrand {
  cssVars: Array<{ name: string; raw: string; value: string; source?: string }>;
  blockedSheets: string[];
  fonts: Array<{ family: string; weights: string[]; styles: string[] }>;
  googleFonts: string[];
  logo: { type: "svg"; svg: string; color: string; w: number; h: number } | { type: "img"; src: string; w: number; h: number } | null;
  favicon: string;
  gradients: string[];
  borders: Array<{ value: string; count: number }>;
  motion: { durations: Array<{ value: string; count: number }>; easings: Array<{ value: string; count: number }> };
  cards: Array<{ bg: string; border: string; radius: number; shadow: string; padding: string; count: number }>;
  link: { color: string; decoration: string; weight: number; underlineOffset: string } | null;
  input: { bg: string; color: string; border: string; radius: number; height: number; paddingX: number; fontSize: number; placeholder: string } | null;
  icons: number;
}

export interface RawPage {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  lang: string;
  themeColor: string;
  ogImage: string;
  viewport: { w: number; h: number };
  pageHeight: number;
  contentWidth: number;
  rootBg: string;
  colors: Array<{ c: string; prop: "bg" | "text" | "border"; w: number }>;
  texts: RawTextSample[];
  radii: Record<string, number>;
  shadows: Record<string, number>;
  spacing: Record<string, number>;
  buttons: RawButton[];
  sections: RawSection[];
  tech: string[];
  motion: {
    gsap: boolean;
    scrollTrigger: boolean;
    lenis: boolean;
    framerMotion: boolean;
    lottie: boolean;
    webgl: boolean;
    transitions: number;
    animations: number;
  };
  fontFaces: string[];
  brand?: RawBrand;
}

export type SectionType =
  | "banner"
  | "navbar"
  | "hero"
  | "logos"
  | "features"
  | "feature-split"
  | "bento"
  | "steps"
  | "stats"
  | "testimonials"
  | "pricing"
  | "comparison"
  | "faq"
  | "cta"
  | "newsletter"
  | "integrations"
  | "team"
  | "blog"
  | "contact"
  | "gallery"
  | "video"
  | "showcase"
  | "footer"
  | "content";

export interface ClassifiedSection {
  idx: number;
  type: SectionType;
  confidence: number; // 0..1
  reasons: string[];
  top: number;
  height: number;
  heading: string;
  text: string;
  columns: number;
  dark: boolean;
  bg: string; // hex
  shot?: string; // ruta absoluta del recorte
  thumb?: string;
}

export interface Swatch {
  hex: string;
  weight: number;
  role?: string;
  en: string;
  es: string;
  family: string;
}

export interface TypeLevel {
  family: string;
  stack?: string;
  size: number;
  weight: number;
  lineHeight: number;
  letterSpacing: number;
  transform?: string;
}

export interface Dna {
  version: 1;
  /** sistema de diseño (tokens declarados + escala tipográfica + componentes); ver analysis/system.ts */
  system?: import("./analysis/system.js").DesignSystem;
  theme: "light" | "dark";
  palette: {
    background: string;
    surface?: string;
    text: string;
    mutedText?: string;
    accent?: string;
    accent2?: string;
    border?: string;
    swatches: Swatch[];
    mood: string[]; // "monochrome", "vivid", "warm neutrals"…
  };
  typography: {
    heading?: TypeLevel;
    body?: TypeLevel;
    display?: TypeLevel;
    label?: TypeLevel;
    levels: Record<string, TypeLevel>;
    baseSize: number;
    scaleRatio: number;
    families: Array<{ family: string; class: string; share: number }>;
    pairing: string; // "serif+sans", "sans", …
  };
  shape: {
    radius: number; // mediana en px
    scale: number[];
    pill: boolean;
    shadows: "none" | "subtle" | "heavy";
    shadowSamples: string[];
  };
  spacing: { base: number; scale: number[] };
  layout: {
    contentWidth: number;
    pageHeight: number;
    sectionCount: number;
    avgSectionHeight: number;
    density: "airy" | "balanced" | "dense";
  };
  buttons: Array<{
    kind: "primary" | "secondary";
    bg: string;
    text: string;
    border?: string;
    radius: number;
    paddingX: number;
    paddingY: number;
    weight: number;
    label: string;
  }>;
  sections: ClassifiedSection[];
  sequence: string[];
  tech: string[];
  motion: string[];
  industry: string[];
  keywords: string[];
}

export interface SiteRecord {
  id: string;
  url: string;
  name: string;
  title: string;
  description: string;
  capturedAt: string;
  tags: string[];
  industry: string[];
  dna: Dna;
  shots: { full?: string; hero?: string; heroThumb?: string };
  /** home, pricing, signup… (ver src/pages.ts) */
  page?: string;
  /** dominio sin www: agrupa la portada, sus páginas internas y su versión móvil */
  host?: string;
  viewport?: "desktop" | "mobile";
}
