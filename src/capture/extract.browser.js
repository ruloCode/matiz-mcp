// Corre DENTRO de la página (page.evaluate con este archivo como string).
// JS plano a propósito: tsx/esbuild inyecta helpers (__name) que no existen en el navegador.
// Devuelve RawPage (ver src/types.ts). Mide lo que el navegador ya calculó: nada se adivina.
(() => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sy = window.scrollY;
  const de = document.documentElement;
  const body = document.body;
  const pageHeight = Math.max(de.scrollHeight, body ? body.scrollHeight : 0);
  const cs = (el) => getComputedStyle(el);
  const transparent = (c) => !c || c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
  const shown = (el, r, s) =>
    r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity) > 0.05;

  // ---------- colores, texto, forma, espaciado ----------
  const colorMap = new Map();
  const addColor = (prop, c, w) => {
    if (transparent(c) || !(w > 0)) return;
    const k = prop + "|" + c;
    colorMap.set(k, (colorMap.get(k) || 0) + w);
  };
  const textMap = new Map();
  const radii = {};
  const shadows = {};
  const spacing = {};
  let transitions = 0;
  let animations = 0;

  const all = body ? body.getElementsByTagName("*") : [];
  const MAX = Math.min(all.length, 9000);
  for (let i = 0; i < MAX; i++) {
    const el = all[i];
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEMPLATE") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = cs(el);
    if (!shown(el, r, s)) continue;
    const area = Math.min(r.width, vw) * Math.min(r.height, 3000);

    addColor("bg", s.backgroundColor, area);

    let own = 0;
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent.trim().length;
    if (own > 0) {
      addColor("text", s.color, own * parseFloat(s.fontSize));
      const stack = s.fontFamily;
      const family = stack.split(",")[0].replace(/["']/g, "").trim();
      const size = parseFloat(s.fontSize);
      const weight = parseInt(s.fontWeight, 10) || 400;
      const lh = s.lineHeight === "normal" ? 1.2 : parseFloat(s.lineHeight) / size;
      const ls = s.letterSpacing === "normal" ? 0 : parseFloat(s.letterSpacing) / size;
      const htag = /^H[1-6]$/.test(tag) ? tag.toLowerCase() : "";
      const key = [family, size, weight, lh.toFixed(2), ls.toFixed(3), s.textTransform, htag].join("|");
      const prev = textMap.get(key);
      if (prev) prev.chars += own;
      else
        textMap.set(key, {
          family, stack, size, weight,
          lh: Math.round(lh * 100) / 100,
          ls: Math.round(ls * 1000) / 1000,
          tt: s.textTransform, tag: htag, chars: own, top: Math.round(r.top + sy),
        });
    }

    const bw = parseFloat(s.borderTopWidth) || parseFloat(s.borderBottomWidth);
    if (bw > 0 && s.borderTopStyle !== "none") addColor("border", s.borderTopColor, r.width);

    const rad = parseFloat(s.borderTopLeftRadius);
    if (rad > 0 && (!transparent(s.backgroundColor) || bw > 0 || tag === "IMG" || tag === "VIDEO")) {
      const k = rad >= Math.min(r.height, r.width) / 2 - 1 && rad >= 12 ? 9999 : Math.round(rad);
      radii[k] = (radii[k] || 0) + 1;
    }
    if (s.boxShadow && s.boxShadow !== "none") shadows[s.boxShadow] = (shadows[s.boxShadow] || 0) + 1;
    for (const p of ["paddingTop", "paddingLeft", "marginBottom", "rowGap", "columnGap"]) {
      const v = parseFloat(s[p]);
      if (v > 0 && v < 320) {
        const k = Math.round(v);
        spacing[k] = (spacing[k] || 0) + 1;
      }
    }
    if (s.transitionDuration && s.transitionDuration !== "0s") transitions++;
    if (s.animationName && s.animationName !== "none") animations++;
  }

  // ---------- botones ----------
  const btnMap = new Map();
  const btnEls = document.querySelectorAll("a, button, [role=button], input[type=submit]");
  for (let i = 0; i < btnEls.length && i < 600; i++) {
    const el = btnEls[i];
    const r = el.getBoundingClientRect();
    if (r.height < 26 || r.height > 84 || r.width < 40 || r.width > 420) continue;
    const s = cs(el);
    if (!shown(el, r, s)) continue;
    const text = (el.innerText || el.value || "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 36) continue;
    const bw = parseFloat(s.borderTopWidth);
    const filled = !transparent(s.backgroundColor);
    if (!filled && !(bw > 0 && !transparent(s.borderTopColor))) continue;
    const key = [s.backgroundColor, s.color, s.borderTopLeftRadius, bw > 0 ? s.borderTopColor : ""].join("|");
    const prev = btnMap.get(key);
    if (prev) {
      prev.count++;
      continue;
    }
    btnMap.set(key, {
      bg: s.backgroundColor,
      color: s.color,
      border: bw > 0 ? s.borderTopColor : "",
      radius: Math.min(9999, parseFloat(s.borderTopLeftRadius) >= r.height / 2 - 1 ? 9999 : parseFloat(s.borderTopLeftRadius)),
      px: parseFloat(s.paddingLeft),
      py: parseFloat(s.paddingTop),
      family: s.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
      size: parseFloat(s.fontSize),
      weight: parseInt(s.fontWeight, 10) || 400,
      text,
      top: Math.round(r.top + sy),
      count: 1,
    });
  }
  const buttons = [...btnMap.values()].sort((a, b) => a.top - b.top).slice(0, 12);

  // ---------- secciones ----------
  const big = (el) => {
    const r = el.getBoundingClientRect();
    return r.height >= 40 && r.width >= vw * 0.5;
  };
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "LINK", "META"]);
  const flowKids = (node) =>
    Array.from(node.children).filter((k) => {
      if (SKIP.has(k.tagName)) return false;
      const s = cs(k);
      if (s.display === "none" || s.visibility === "hidden") return false;
      if (s.position === "fixed") {
        // solo un header fijo arriba cuenta como bloque
        const r = k.getBoundingClientRect();
        return r.top + sy < 10 && r.height < 160 && r.width >= vw * 0.8;
      }
      return big(k);
    });
  const descend = (root) => {
    let node = root;
    for (let g = 0; g < 14; g++) {
      const kids = flowKids(node);
      if (kids.length === 1) {
        node = kids[0];
        continue;
      }
      return kids;
    }
    return [];
  };
  const out = [];
  const expand = (el, depth) => {
    const r = el.getBoundingClientRect();
    const kids = descend(el);
    const tall = r.height > vh * 1.5;
    if (depth < 4 && kids.length >= 2 && (tall || el.tagName === "MAIN" || el.tagName === "ARTICLE")) {
      kids.forEach((k) => expand(k, depth + 1));
    } else out.push(el);
  };
  if (body) descend(body).forEach((b) => expand(b, 0));
  // orden por posición y sin anidados duplicados
  const blocks = out
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .sort((a, b) => a.r.top - b.r.top)
    .filter((b, i, arr) => !arr.some((o, j) => j !== i && o.el !== b.el && o.el.contains(b.el)));

  const effBg = (el) => {
    let n = el;
    while (n && n !== de) {
      const b = cs(n).backgroundColor;
      if (!transparent(b)) return b;
      n = n.parentElement;
    }
    const hb = cs(de).backgroundColor;
    return transparent(hb) ? (body && !transparent(cs(body).backgroundColor) ? cs(body).backgroundColor : "rgb(255, 255, 255)") : hb;
  };
  // fondo propio: el bloque o un hijo que lo cubra casi entero
  const blockBg = (el, r) => {
    const s = cs(el);
    if (!transparent(s.backgroundColor)) return s.backgroundColor;
    for (const k of el.children) {
      const kr = k.getBoundingClientRect();
      if (kr.width >= r.width * 0.9 && kr.height >= r.height * 0.8) {
        const b = cs(k).backgroundColor;
        if (!transparent(b)) return b;
      }
    }
    return effBg(el);
  };

  const sectionOf = ({ el, r }, idx) => {
    const s = cs(el);
    const q = (sel) => el.querySelectorAll(sel).length;
    const text = (el.innerText || "").replace(/\s+/g, " ").trim();
    const hs = Array.from(el.querySelectorAll("h1,h2,h3")).slice(0, 4);
    const headings = hs.map((h) => (h.innerText || "").replace(/\s+/g, " ").trim().slice(0, 160)).filter(Boolean);
    const headingSizes = hs.map((h) => parseFloat(cs(h).fontSize));
    // columnas: el contenedor con más hijos alineados en la misma fila
    let columns = 1;
    let cards = 0;
    const conts = [el, ...Array.from(el.querySelectorAll("div,ul,ol,section,article")).slice(0, 500)];
    for (const c of conts) {
      const kids = Array.from(c.children).filter((k) => {
        const kr = k.getBoundingClientRect();
        return kr.width > 80 && kr.height > 60 && kr.width < r.width * 0.95;
      });
      if (kids.length < 2) continue;
      const rows = {};
      kids.forEach((k) => {
        const t = Math.round(k.getBoundingClientRect().top / 12);
        rows[t] = (rows[t] || 0) + 1;
      });
      const row = Math.max(...Object.values(rows));
      if (row > columns && row <= 8) columns = row;
      if (row >= 2 && kids.length > cards) cards = kids.length;
    }
    const imgs = Array.from(el.querySelectorAll("img, svg, picture"));
    let smallImg = 0;
    let img = 0;
    for (const x of imgs) {
      const xr = x.getBoundingClientRect();
      if (xr.width === 0) continue;
      if (x.tagName !== "svg" || xr.width > 40) img += x.tagName === "IMG" || x.tagName === "PICTURE" ? 1 : 0;
      if (xr.height <= 90 && xr.width >= 36 && xr.width <= 240 && x.closest("a,button") === null) smallImg++;
    }
    return {
      idx,
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      cls: (typeof el.className === "string" ? el.className : "").slice(0, 160).toLowerCase(),
      top: Math.round(r.top + sy),
      height: Math.round(r.height),
      width: Math.round(r.width),
      headings,
      headingSizes,
      text: text.slice(0, 700),
      textLength: text.length,
      counts: {
        img,
        smallImg,
        svg: q("svg"),
        video: q("video"),
        iframe: q("iframe"),
        button: q("button, [role=button], a[class*=btn], a[class*=button]"),
        link: q("a[href]"),
        input: q("input:not([type=hidden])"),
        emailInput: q("input[type=email], input[name*=email i]"),
        textarea: q("textarea"),
        form: q("form"),
        li: q("li"),
        table: q("table"),
        heading: q("h1,h2,h3"),
        details: q("details"),
        expanders: q("[aria-expanded]"),
        blockquote: q("blockquote, figure > blockquote, q"),
        code: q("pre, code"),
        canvas: q("canvas"),
        article: q("article"),
        time: q("time"),
      },
      columns,
      cards,
      layout: s.display,
      textAlign: hs[0] ? cs(hs[0]).textAlign : s.textAlign,
      bg: blockBg(el, r),
      bgImage: s.backgroundImage !== "none",
      position: s.position,
    };
  };
  // el navbar suele ser fixed/sticky y quedar fuera del flujo: si ningún bloque arranca arriba, se agrega
  if (!blocks.some((b) => b.r.top + sy < 12)) {
    const nav = Array.from(document.querySelectorAll("header, nav, [role=banner]")).find((el) => {
      const r = el.getBoundingClientRect();
      return r.top + sy < 12 && r.height >= 32 && r.height < 170 && r.width >= vw * 0.8;
    });
    if (nav && !blocks.some((b) => b.el.contains(nav) || nav.contains(b.el))) blocks.unshift({ el: nav, r: nav.getBoundingClientRect() });
  }
  const sections = blocks
    .slice(0, 44)
    .map(sectionOf)
    // fuera: espaciadores y capas de fondo absolutas (sin texto ni medios)
    .filter((s) => s.textLength > 0 || s.counts.img + s.counts.video + s.counts.canvas + s.counts.iframe > 0)
    .filter((s) => !(s.position === "absolute" && s.textLength < 40))
    .map((s, i) => ({ ...s, idx: i }));

  // ---------- ancho de contenido ----------
  const widths = {};
  const conts = document.querySelectorAll("div, section, main, header, footer, nav");
  for (let i = 0; i < conts.length && i < 4000; i++) {
    const el = conts[i];
    const s = cs(el);
    const mw = parseFloat(s.maxWidth);
    if (mw >= 560 && mw <= 1920 && mw < vw - 16) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) {
        const k = Math.round(Math.min(mw, r.width) / 8) * 8;
        widths[k] = (widths[k] || 0) + r.height;
      }
    }
  }
  const contentWidth = +(Object.entries(widths).sort((a, b) => b[1] - a[1])[0] || [Math.min(vw, 1200)])[0];

  // ---------- tecnología y movimiento ----------
  const gen = (document.querySelector("meta[name=generator]") || {}).content || "";
  const tech = [];
  if (window.__NEXT_DATA__ || document.querySelector("script[src*='/_next/']")) tech.push("nextjs");
  if (window.__NUXT__ || document.querySelector("#__nuxt")) tech.push("nuxt");
  if (/framer/i.test(gen) || document.querySelector("[data-framer-name], [data-framer-component-type]")) tech.push("framer");
  if (de.hasAttribute("data-wf-site")) tech.push("webflow");
  if (/wordpress/i.test(gen)) tech.push("wordpress");
  if (window.Shopify) tech.push("shopify");
  if (document.querySelector("astro-island, [data-astro-cid]") || /astro/i.test(gen)) tech.push("astro");
  if (document.querySelector("[data-svelte-h], [class*='svelte-']")) tech.push("svelte");
  let tw = 0;
  const twRe = /(^|\s)(flex|grid|px-\d|py-\d|mt-\d|gap-\d|text-(xs|sm|lg|xl|\dxl)|bg-[a-z]+-\d{2,3}|rounded-(md|lg|xl|full))(\s|$)/;
  for (let i = 0; i < all.length && i < 3000; i++) if (typeof all[i].className === "string" && twRe.test(all[i].className)) tw++;
  if (tw > 40) tech.push("tailwind");

  const fontFaces = [];
  try {
    document.fonts.forEach((f) => {
      if (f.status === "loaded") fontFaces.push(f.family.replace(/["']/g, ""));
    });
  } catch (e) {}

  const rootBgRaw = transparent(cs(de).backgroundColor)
    ? body && !transparent(cs(body).backgroundColor) ? cs(body).backgroundColor : "rgb(255, 255, 255)"
    : cs(de).backgroundColor;

  const meta = (sel) => (document.querySelector(sel) || {}).content || "";
  return {
    url: location.href,
    finalUrl: location.href,
    title: document.title,
    description: meta("meta[name=description]") || meta("meta[property='og:description']"),
    lang: de.lang || "",
    themeColor: meta("meta[name=theme-color]"),
    ogImage: meta("meta[property='og:image']"),
    viewport: { w: vw, h: vh },
    pageHeight,
    contentWidth,
    rootBg: rootBgRaw,
    colors: [...colorMap.entries()].map(([k, w]) => {
      const i = k.indexOf("|");
      return { prop: k.slice(0, i), c: k.slice(i + 1), w: Math.round(w) };
    }),
    texts: [...textMap.values()].filter((t) => t.chars >= 2).sort((a, b) => b.chars - a.chars).slice(0, 160),
    radii,
    shadows,
    spacing,
    buttons,
    sections,
    tech,
    motion: {
      gsap: !!window.gsap,
      scrollTrigger: !!window.ScrollTrigger,
      lenis: de.classList.contains("lenis") || !!window.lenis || !!window.Lenis,
      framerMotion: tech.includes("framer") || !!document.querySelector("[data-projection-id], [style*='will-change: transform']"),
      lottie: !!document.querySelector("lottie-player, dotlottie-player, [data-animation-path]") || !!window.lottie,
      webgl: document.querySelectorAll("canvas").length > 0 && !!document.querySelector("canvas[data-engine], canvas[width]"),
      transitions,
      animations,
    },
    fontFaces: [...new Set(fontFaces)].slice(0, 20),
  };
})();
