// Páginas sintéticas para los tests: nada de contenido real de terceros en el repo.
import type { RawPage, RawSection, RawSectionCounts } from "../src/types.js";

const zero: RawSectionCounts = {
  img: 0, smallImg: 0, svg: 0, video: 0, iframe: 0, button: 0, link: 0, input: 0, emailInput: 0, textarea: 0,
  form: 0, li: 0, table: 0, heading: 0, details: 0, expanders: 0, blockquote: 0, code: 0, canvas: 0, article: 0, time: 0,
};

export function sec(p: Omit<Partial<RawSection>, "counts"> & { counts?: Partial<RawSectionCounts> }): RawSection {
  const text = p.text ?? "";
  return {
    idx: 0, tag: "section", id: "", cls: "", top: 1000, height: 600, width: 1440,
    headings: [], headingSizes: [], text, textLength: p.textLength ?? text.length, columns: 1, cards: 0,
    layout: "block", textAlign: "left", bg: "rgb(255, 255, 255)", bgImage: false, position: "static",
    ...p,
    counts: { ...zero, ...(p.counts ?? {}) },
  };
}

export function page(p: Partial<RawPage> = {}): RawPage {
  const sections = p.sections ?? [
    sec({ tag: "header", top: 0, height: 64, text: "Product Pricing Docs Log in Sign up", counts: { link: 5 } }),
    sec({ top: 64, height: 720, headings: ["Build faster"], headingSizes: [64], text: "Build faster The platform for teams. Get started", counts: { heading: 1, button: 2 } }),
    sec({ top: 784, height: 120, text: "Trusted by", counts: { smallImg: 6 } }),
    sec({ top: 904, height: 700, headings: ["Everything you need"], text: "Everything you need Fast Secure Simple", columns: 3, cards: 3, counts: { heading: 4 } }),
    sec({ top: 1604, height: 300, headings: ["Start today"], text: "Start today Get started", counts: { heading: 1, button: 1 } }),
    sec({ tag: "footer", top: 1904, height: 300, text: "© 2026 Company. Privacy Terms Docs Blog About Careers", counts: { link: 8 } }),
  ];
  return {
    url: "https://example.com/", finalUrl: "https://example.com/", title: "Example — Build faster", description: "Developer platform for teams",
    lang: "en", themeColor: "", ogImage: "", viewport: { w: 1440, h: 900 }, pageHeight: 2204, contentWidth: 1200,
    rootBg: "rgb(255, 255, 255)",
    colors: [
      { c: "rgb(255, 255, 255)", prop: "bg", w: 3_000_000 },
      { c: "rgb(245, 245, 244)", prop: "bg", w: 400_000 },
      { c: "rgb(37, 99, 235)", prop: "bg", w: 20_000 },
      { c: "rgb(17, 17, 17)", prop: "text", w: 50_000 },
      { c: "rgb(107, 114, 128)", prop: "text", w: 12_000 },
      { c: "rgb(229, 231, 235)", prop: "border", w: 30_000 },
    ],
    texts: [
      { family: "Inter", stack: "Inter, sans-serif", size: 16, weight: 400, lh: 1.5, ls: 0, tt: "none", tag: "", chars: 3000, top: 900 },
      { family: "Fraunces", stack: "Fraunces, serif", size: 64, weight: 600, lh: 1.05, ls: -0.03, tt: "none", tag: "h1", chars: 30, top: 200 },
      { family: "Fraunces", stack: "Fraunces, serif", size: 40, weight: 600, lh: 1.1, ls: -0.02, tt: "none", tag: "h2", chars: 120, top: 1000 },
      { family: "Inter", stack: "Inter, sans-serif", size: 13, weight: 500, lh: 1.4, ls: 0.08, tt: "uppercase", tag: "", chars: 60, top: 950 },
    ],
    radii: { "8": 40, "12": 10, "9999": 6 },
    shadows: {},
    spacing: { "8": 30, "16": 50, "24": 40, "32": 20, "64": 12, "96": 10 },
    buttons: [
      { bg: "rgb(37, 99, 235)", color: "rgb(255, 255, 255)", border: "", radius: 8, px: 20, py: 10, family: "Inter", size: 15, weight: 600, text: "Get started", top: 400, count: 2 },
      { bg: "rgba(0, 0, 0, 0)", color: "rgb(17, 17, 17)", border: "rgb(229, 231, 235)", radius: 8, px: 20, py: 10, family: "Inter", size: 15, weight: 500, text: "Docs", top: 400, count: 1 },
    ],
    tech: ["nextjs"],
    motion: { gsap: false, scrollTrigger: false, lenis: false, framerMotion: false, lottie: false, webgl: false, transitions: 10, animations: 0 },
    fontFaces: ["Inter", "Fraunces"],
    ...p,
    sections: sections.map((s, i) => ({ ...s, idx: i })),
  };
}
