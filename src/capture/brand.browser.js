// Corre DENTRO de la página: el "sistema" de la marca, más allá de lo que se pinta.
// Variables CSS declaradas (las hojas de otros dominios las completa Node), fuentes cargadas,
// logo y favicon, degradados, estilos de link/input/tarjeta, movimiento y bordes.
(() => {
  const cs = (el) => getComputedStyle(el);
  const vw = window.innerWidth;
  const sy = window.scrollY;
  const transparent = (c) => !c || c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const s = cs(el);
    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity) > 0.05;
  };
  const root = document.documentElement;
  const rcs = cs(root);

  // ---------- variables CSS declaradas en :root / html / body / [data-theme] ----------
  const vars = new Map();
  const blocked = [];
  const isRootSel = (sel) => sel.split(",").some((x) => /^(:root|html|body)(\[[^\]]*\]|\.[\w-]+|:not\([^)]*\))*$/i.test(x.trim()) || /^\[data-(theme|mode|color-scheme)[^\]]*\]$/i.test(x.trim()));
  const visit = (rules) => {
    for (const r of rules) {
      try {
        if (r.selectorText && r.style && isRootSel(r.selectorText)) {
          for (let i = 0; i < r.style.length; i++) {
            const name = r.style[i];
            if (name.startsWith("--") && !vars.has(name)) vars.set(name, r.style.getPropertyValue(name).trim());
          }
        }
        if (r.cssRules && !r.selectorText) visit(r.cssRules); // @media, @supports, @layer
      } catch (e) {}
    }
  };
  for (const sh of document.styleSheets) {
    try {
      visit(sh.cssRules);
    } catch (e) {
      if (sh.href) blocked.push(sh.href); // otro dominio: Node la descarga
    }
  }
  for (let i = 0; i < root.style.length; i++) {
    const n = root.style[i];
    if (n.startsWith("--")) vars.set(n, root.style.getPropertyValue(n).trim());
  }
  const cssVars = [...vars.entries()].slice(0, 800).map(([name, raw]) => ({ name, raw: raw.slice(0, 240), value: rcs.getPropertyValue(name).trim().slice(0, 240) }));

  // ---------- fuentes ----------
  const fontMap = new Map();
  try {
    document.fonts.forEach((f) => {
      if (f.status !== "loaded") return;
      const fam = f.family.replace(/["']/g, "").trim();
      const e = fontMap.get(fam) || { family: fam, weights: new Set(), styles: new Set() };
      String(f.weight).split(" ").forEach((w) => e.weights.add(w));
      e.styles.add(f.style);
      fontMap.set(fam, e);
    });
  } catch (e) {}
  const fonts = [...fontMap.values()].slice(0, 24).map((f) => ({ family: f.family, weights: [...f.weights].sort(), styles: [...f.styles] }));
  const googleFonts = [...document.querySelectorAll('link[href*="fonts.googleapis.com"], link[href*="fonts.bunny.net"]')].map((l) => l.href).slice(0, 4);

  // ---------- logo y favicon ----------
  // el logo: arriba, chico, con pistas de "logo" o dentro del enlace a la home; se puntúa y gana el mejor
  let logo = null;
  let best = -1;
  const homeHref = (a) => {
    try {
      const u = new URL(a.href, location.href);
      return u.host === location.host && (u.pathname === "/" || /^\/[a-z]{2}(-[a-z]{2})?\/?$/i.test(u.pathname));
    } catch (e) {
      return false;
    }
  };
  const cands = [...document.querySelectorAll("svg, img, picture img, [class*='logo' i], [id*='logo' i]")].slice(0, 400);
  for (const el of cands) {
    const r = el.getBoundingClientRect();
    if (!shown(el) || r.top + sy > 160 || r.width < 28 || r.width > 320 || r.height < 12 || r.height > 96) continue;
    const tag = el.tagName.toLowerCase();
    const hint = `${el.id} ${typeof el.className === "string" ? el.className : el.className?.baseVal || ""} ${el.getAttribute("alt") || ""} ${el.getAttribute("aria-label") || ""} ${el.closest("a")?.getAttribute("aria-label") || ""}`;
    let score = 0;
    if (/logo|brand|marca/i.test(hint)) score += 3;
    const a = el.closest("a");
    if (a && homeHref(a)) score += 3;
    if (r.left < vw * 0.35) score += 1;
    if (tag === "svg" || tag === "img") score += 1;
    const bgImg = cs(el).backgroundImage;
    if (tag !== "svg" && tag !== "img" && !(bgImg && bgImg.startsWith("url("))) {
      const inner = el.querySelector("svg, img");
      if (!inner) continue;
    }
    if (score <= best) continue;
    best = score;
    const target = tag === "svg" || tag === "img" ? el : el.querySelector("svg, img") || el;
    const tr = target.getBoundingClientRect();
    if (target.tagName.toLowerCase() === "svg") {
      const clone = target.cloneNode(true);
      clone.setAttribute("width", String(Math.round(tr.width)));
      clone.setAttribute("height", String(Math.round(tr.height)));
      if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${Math.round(tr.width)} ${Math.round(tr.height)}`);
      const html = clone.outerHTML;
      if (html.length <= 40000) logo = { type: "svg", svg: html, color: cs(target).color, w: Math.round(tr.width), h: Math.round(tr.height) };
    } else if (target.tagName.toLowerCase() === "img") {
      logo = { type: "img", src: target.currentSrc || target.src, w: Math.round(tr.width), h: Math.round(tr.height) };
    } else if (bgImg && bgImg.startsWith("url(")) {
      logo = { type: "img", src: bgImg.slice(4, -1).replace(/["']/g, ""), w: Math.round(r.width), h: Math.round(r.height) };
    }
  }
  const iconEl = document.querySelector('link[rel="icon"][type="image/svg+xml"], link[rel="apple-touch-icon"], link[rel~="icon"]');
  const favicon = iconEl ? iconEl.href : new URL("/favicon.ico", location.href).href;

  // ---------- recorrido único: degradados, bordes, movimiento, tarjetas ----------
  const grads = new Map();
  const borders = {};
  const durations = {};
  const easings = {};
  const cardSig = new Map();
  let icons = 0;
  const all = document.body ? document.body.getElementsByTagName("*") : [];
  const N = Math.min(all.length, 6000);
  const effBg = (el) => {
    for (let n = el; n && n !== root; n = n.parentElement) {
      const b = cs(n).backgroundColor;
      if (!transparent(b)) return b;
    }
    return rcs.backgroundColor;
  };
  for (let i = 0; i < N; i++) {
    const el = all[i];
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = cs(el);
    if (s.display === "none" || s.visibility === "hidden") continue;
    if (s.backgroundImage && s.backgroundImage.includes("gradient(")) {
      const g = s.backgroundImage.slice(0, 320);
      grads.set(g, (grads.get(g) || 0) + r.width * r.height);
    }
    const bw = parseFloat(s.borderTopWidth);
    if (bw > 0 && s.borderTopStyle !== "none") borders[bw] = (borders[bw] || 0) + 1;
    const d = s.transitionDuration.split(",")[0].trim();
    if (d && d !== "0s") {
      durations[d] = (durations[d] || 0) + 1;
      const e = s.transitionTimingFunction.split(/,(?![^(]*\))/)[0].trim();
      easings[e] = (easings[e] || 0) + 1;
    }
    if (el.tagName.toLowerCase() === "svg" && r.width <= 32 && r.height <= 32) icons++;
    // tarjeta: caja con fondo propio, borde o sombra, radio, y contenido de texto
    const rad = parseFloat(s.borderTopLeftRadius);
    if (rad > 0 && r.width >= 180 && r.width <= vw * 0.62 && r.height >= 110 && r.height <= 900) {
      const ownBg = !transparent(s.backgroundColor) && s.backgroundColor !== effBg(el.parentElement || el);
      const hasBorder = bw > 0 && !transparent(s.borderTopColor);
      const hasShadow = s.boxShadow && s.boxShadow !== "none";
      if ((ownBg || hasBorder || hasShadow) && el.querySelector("h2, h3, h4, p")) {
        const sig = [s.backgroundColor, hasBorder ? `${bw}px ${s.borderTopColor}` : "", Math.round(rad), hasShadow ? s.boxShadow.slice(0, 160) : ""].join("|");
        const e = cardSig.get(sig) || { bg: s.backgroundColor, border: hasBorder ? `${bw}px solid ${s.borderTopColor}` : "", radius: Math.round(rad), shadow: hasShadow ? s.boxShadow.slice(0, 200) : "", padding: `${parseFloat(s.paddingTop)}px ${parseFloat(s.paddingLeft)}px`, count: 0 };
        e.count++;
        cardSig.set(sig, e);
      }
    }
  }
  const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));

  // ---------- link e input ----------
  let link = null;
  for (const a of document.querySelectorAll("p a, li a, article a")) {
    if (!shown(a)) continue;
    const s = cs(a);
    if (!transparent(s.backgroundColor) || parseFloat(s.borderTopWidth) > 0) continue;
    link = { color: s.color, decoration: s.textDecorationLine, weight: parseInt(s.fontWeight, 10) || 400, underlineOffset: s.textUnderlineOffset };
    break;
  }
  let input = null;
  for (const el of document.querySelectorAll('input[type="email"], input[type="text"], input[type="search"], input:not([type]), textarea')) {
    if (!shown(el)) continue;
    const s = cs(el);
    const r = el.getBoundingClientRect();
    // un input real: alto de control y con fondo o borde (no un editor de demo)
    if (r.height > 80 || r.width < 120 || (transparent(s.backgroundColor) && !(parseFloat(s.borderTopWidth) > 0) && !(parseFloat(s.borderBottomWidth) > 0))) continue;
    input = { bg: s.backgroundColor, color: s.color, border: `${parseFloat(s.borderTopWidth)}px ${s.borderTopStyle} ${s.borderTopColor}`, radius: Math.round(parseFloat(s.borderTopLeftRadius)), height: Math.round(r.height), paddingX: Math.round(parseFloat(s.paddingLeft)), fontSize: parseFloat(s.fontSize), placeholder: el.getAttribute("placeholder") ? "sí" : "" };
    break;
  }

  return {
    cssVars,
    blockedSheets: blocked.slice(0, 12),
    fonts,
    googleFonts,
    logo,
    favicon,
    gradients: [...grads.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value]) => value),
    borders: top(borders, 4),
    motion: { durations: top(durations, 4), easings: top(easings, 3) },
    cards: [...cardSig.values()].sort((a, b) => b.count - a.count).slice(0, 3),
    link,
    input,
    icons,
  };
})();
