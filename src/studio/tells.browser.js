// Corre DENTRO de una pantalla del Estudio. Cuenta "señales de plantilla": tratamientos que
// los modelos ponen por defecto sea cual sea el encargo (degradados de adorno, etiquetas en
// mayúsculas sobre cada título, contenido picado en tarjetas idénticas…). No dice que estén
// mal: dice cuántas hay y dónde, para que cada una sea una decisión y no un reflejo.
(opts) => {
  const vw = window.innerWidth;
  const sx = window.scrollX, sy = window.scrollY;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (str) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = str;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const hue = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 0.12) return null; // gris: sin tono
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && parseFloat(s.opacity) > 0.05;
  };
  const txt = (el) => (el.innerText || "").replace(/\s+/g, " ").trim();
  const ownText = (el) => Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").replace(/\s+/g, " ").trim();
  const path = (el) => {
    const parts = [];
    let e = el;
    while (e && e.nodeType === 1 && e !== document.body && parts.length < 4) {
      let p = e.tagName.toLowerCase();
      if (e.id) { parts.unshift(p + "#" + e.id); break; }
      const sib = e.parentElement ? Array.from(e.parentElement.children).filter((c) => c.tagName === e.tagName) : [];
      if (sib.length > 1) p += `:nth-of-type(${sib.indexOf(e) + 1})`;
      parts.unshift(p);
      e = e.parentElement;
    }
    return parts.join(" > ");
  };
  const ex = (el) => {
    const r = el.getBoundingClientRect();
    return { tag: el.tagName.toLowerCase(), text: txt(el).slice(0, 60), path: path(el), box: [Math.round(r.left + sx), Math.round(r.top + sy), Math.round(r.width), Math.round(r.height)] };
  };

  const all = Array.from(document.body.querySelectorAll("*")).slice(0, 8000).filter(visible);
  const styles = new Map(all.map((el) => [el, getComputedStyle(el)]));
  const out = {};
  const put = (id, els, extra = {}) => { if (els.length) out[id] = { count: els.length, examples: els.slice(0, 3).map(ex), ...extra }; };

  // 1) degradados de adorno (fondo o texto), y si tiran a morado
  const grads = [];
  let purple = 0;
  for (const el of all) {
    const s = styles.get(el);
    if (!/gradient\(/.test(s.backgroundImage)) continue;
    const r = el.getBoundingClientRect();
    const isText = s.webkitBackgroundClip === "text" || s.backgroundClip === "text";
    if (!isText && r.width * r.height < vw * 40) continue; // rayitas y bordes no cuentan
    grads.push(el);
    const cols = s.backgroundImage.match(/(rgba?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8})/gi) || [];
    if (cols.some((c) => { const h = hue(rgba(c)); return h !== null && h >= 245 && h <= 315; })) purple++;
  }
  put("gradient", grads, { purple });

  // 2) etiqueta en mayúsculas con tracking justo encima de un título
  const eyebrows = [];
  for (const el of all) {
    const t = ownText(el);
    if (t.length < 3 || t.length > 48) continue;
    const s = styles.get(el);
    const caps = s.textTransform === "uppercase" || (t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(t));
    if (!caps || parseFloat(s.fontSize) > 15) continue;
    let nx = el.nextElementSibling;
    if (!nx && el.parentElement) nx = el.parentElement.nextElementSibling;
    if (nx && (/^H[1-4]$/.test(nx.tagName) || (nx.querySelector && nx.querySelector("h1,h2,h3") === nx.firstElementChild))) eyebrows.push(el);
  }
  put("eyebrow", eyebrows);

  // 3) una sola palabra o frase del titular en otro color o en cursiva
  const accents = [];
  for (const h of document.querySelectorAll("h1, h2")) {
    if (!visible(h)) continue;
    const hs = getComputedStyle(h);
    const total = txt(h).length;
    for (const c of h.querySelectorAll("span, em, i, b, strong, mark")) {
      const cs = getComputedStyle(c);
      const part = txt(c).length;
      if (!part || part > total * 0.6) continue;
      const grad = /gradient\(/.test(cs.backgroundImage);
      if (cs.color !== hs.color || cs.fontStyle !== hs.fontStyle || grad) { accents.push(h); break; }
    }
  }
  put("accent-word", accents);

  // 4) kit de tarjetas: grupos de 3+ hermanos con el mismo radio y la misma sombra/borde
  const groups = [];
  const radii = new Map();
  const shadows = new Map();
  for (const el of all) {
    const s = styles.get(el);
    const rad = parseFloat(s.borderTopLeftRadius) || 0;
    const r = el.getBoundingClientRect();
    if (rad > 0 && rad < 999 && r.width > 80 && r.height > 40) radii.set(rad, (radii.get(rad) || 0) + 1);
    if (s.boxShadow && s.boxShadow !== "none" && r.width > 80) shadows.set(s.boxShadow, (shadows.get(s.boxShadow) || 0) + 1);
  }
  for (const parent of all) {
    const kids = Array.from(parent.children).filter((k) => styles.has(k));
    if (kids.length < 3) continue;
    const sig = (k) => {
      const s = styles.get(k);
      const r = k.getBoundingClientRect();
      const boxed = (s.boxShadow && s.boxShadow !== "none") || parseFloat(s.borderTopWidth) > 0 || rgba(s.backgroundColor)[3] > 0;
      const rad = parseFloat(s.borderTopLeftRadius) || 0;
      if (!boxed || rad <= 0 || r.width < 140 || r.height < 90) return null;
      return `${rad}|${s.boxShadow}|${s.borderTopWidth}|${Math.round(r.width / 8)}`;
    };
    const sigs = kids.map(sig);
    const first = sigs.find(Boolean);
    if (first && sigs.filter((x) => x === first).length >= 3) groups.push(parent);
  }
  if (groups.length >= 2) put("card-kit", groups, { groups: groups.length });
  const radiusKinds = [...radii.entries()].filter(([, n]) => n >= 2);
  const roundedTotal = [...radii.values()].reduce((a, b) => a + b, 0);
  if (radiusKinds.length === 1 && roundedTotal >= 8) out["one-radius"] = { count: roundedTotal, radius: radiusKinds[0][0], examples: [] };
  const topShadow = [...shadows.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topShadow && topShadow[1] >= 6 && shadows.size === 1) out["one-shadow"] = { count: topShadow[1], shadow: topShadow[0].slice(0, 80), examples: [] };

  // 5) emoji haciendo de ícono
  const emoji = all.filter((el) => { const t = ownText(el); return t && t.length <= 4 && /^\p{Extended_Pictographic}/u.test(t); });
  if (emoji.length >= 2) put("emoji-icon", emoji);

  // 6) flecha pegada al texto de enlaces y botones
  const arrows = Array.from(document.querySelectorAll("a, button")).filter((el) => visible(el) && /\s?[→↗›»]\s*$/.test(txt(el)) && txt(el).length > 2);
  if (arrows.length >= 2) put("arrow-suffix", arrows);

  // 7) marcadores 01 / 02 / 03
  const nums = all.filter((el) => /^0[1-9]\.?$/.test(ownText(el)));
  if (nums.length >= 3) put("numbered", nums);

  // 8) metadatos unidos con punto medio
  const dots = all.filter((el) => { const t = ownText(el); return t.length < 90 && (t.match(/ · /g) || []).length >= 2; });
  if (dots.length >= 2) put("middot", dots);

  // 9) paneles de vidrio
  const glass = all.filter((el) => { const s = styles.get(el); const b = s.backdropFilter || s.webkitBackdropFilter; const r = el.getBoundingClientRect(); return b && b !== "none" && r.width * r.height > 20000; });
  put("glass", glass);

  // 10) líneas demasiado largas (más de ~85 caracteres por línea en párrafos de lectura)
  const long = [];
  for (const el of document.querySelectorAll("p, li")) {
    if (!visible(el)) continue;
    const t = txt(el);
    if (t.length < 180) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const lines = Math.max(1, Math.round(r.height / (parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.5)));
    const perLine = t.length / lines;
    if (lines >= 2 && perLine > 85) long.push(el);
  }
  put("long-lines", long);

  // 11) tamaños de letra sin sistema
  const sizes = new Map();
  let centered = 0, blocks = 0;
  for (const el of all) {
    const t = ownText(el);
    if (t.length < 2) continue;
    const s = styles.get(el);
    const fs = Math.round(parseFloat(s.fontSize));
    sizes.set(fs, (sizes.get(fs) || 0) + t.length);
    if (t.length > 12) { blocks++; if (s.textAlign === "center") centered++; }
  }
  if (sizes.size > 9) out["type-sizes"] = { count: sizes.size, sizes: [...sizes.keys()].sort((a, b) => a - b), examples: [] };
  if (blocks >= 10 && centered / blocks > 0.75) out["all-centered"] = { count: centered, of: blocks, examples: [] };

  // 12) animación de entrada en todo
  const anim = all.filter((el) => { const s = styles.get(el); return s.animationName && s.animationName !== "none"; });
  if (anim.length >= 5) put("animate-all", anim);

  // 13) familia por defecto en el texto
  const bodyFamily = getComputedStyle(document.body).fontFamily.split(",")[0].replace(/["']/g, "").trim();
  const h = document.querySelector("h1, h2");
  const headFamily = h ? getComputedStyle(h).fontFamily.split(",")[0].replace(/["']/g, "").trim() : bodyFamily;
  out.fonts = { body: bodyFamily, heading: headFamily };

  return out;
}
