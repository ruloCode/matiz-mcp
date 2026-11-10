// Corre DENTRO de una pantalla del Estudio ya renderizada (JS plano: lo inyecta Playwright).
// Devuelve problemas medidos (no opiniones) y las cajas de los elementos que se pueden
// señalar con un comentario en el lienzo.
(opts) => {
  const vw = window.innerWidth;
  const doc = document.documentElement;
  const sx = window.scrollX, sy = window.scrollY;

  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  /** Cualquier color CSS (oklch, color-mix, rgb…) → [r,g,b,a 0..1] usando el propio navegador. */
  const rgba = (str) => {
    if (!str || str === "transparent") return [0, 0, 0, 0];
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = str;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, bottom) => [0, 1, 2].map((i) => Math.round(top[i] * top[3] + bottom[i] * (1 - top[3]))).concat(1);
  const hex = (c) => "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && parseFloat(s.opacity) > 0.05;
  };
  const path = (el) => {
    const parts = [];
    let e = el;
    while (e && e.nodeType === 1 && e !== document.body && parts.length < 5) {
      let p = e.tagName.toLowerCase();
      if (e.id) { parts.unshift(p + "#" + e.id); break; }
      const sib = e.parentElement ? Array.from(e.parentElement.children).filter((c) => c.tagName === e.tagName) : [];
      if (sib.length > 1) p += `:nth-of-type(${sib.indexOf(e) + 1})`;
      parts.unshift(p);
      e = e.parentElement;
    }
    return parts.join(" > ");
  };
  const text = (el) => (el.innerText || el.getAttribute("aria-label") || el.getAttribute("alt") || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 90);
  const desc = (el) => {
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      text: text(el),
      classes: (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 10).join(" "),
      path: path(el),
      box: [Math.round(r.left + sx), Math.round(r.top + sy), Math.round(r.width), Math.round(r.height)],
    };
  };

  const all = Array.from(document.body.querySelectorAll("*")).slice(0, 9000);

  // 1) desborde horizontal: el culpable es el elemento que se sale y cuyo padre no
  const overflow = { scrollWidth: doc.scrollWidth, viewport: vw, culprits: [] };
  if (doc.scrollWidth > vw + 1) {
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.right <= vw + 1) continue;
      const pr = el.parentElement && el.parentElement.getBoundingClientRect();
      if (pr && pr.right > vw + 1 && el.parentElement !== document.body) continue;
      overflow.culprits.push({ ...desc(el), right: Math.round(r.right) });
      if (overflow.culprits.length >= 5) break;
    }
  }

  // 2) imágenes rotas
  const brokenImages = Array.from(document.images)
    .filter((i) => i.complete && i.naturalWidth === 0)
    .map((i) => (i.currentSrc || i.src || "").slice(0, 160))
    .slice(0, 8);

  // 3) contraste de cada texto contra su fondo real (el primer ancestro con fondo opaco)
  const pageBg = rgba(getComputedStyle(document.body).backgroundColor)[3] > 0 ? rgba(getComputedStyle(document.body).backgroundColor) : rgba(getComputedStyle(doc).backgroundColor);
  const base = pageBg[3] > 0 ? pageBg : [255, 255, 255, 1];
  const lowContrast = [];
  const seenText = new Set();
  let checked = 0;
  for (const el of all) {
    if (checked > 2500) break;
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own || !visible(el)) continue;
    checked++;
    const s = getComputedStyle(el);
    let fg = rgba(s.color);
    if (fg[3] === 0) continue;
    // fondo: se apilan los fondos de los ancestros hasta uno opaco; si hay imagen/degradado en medio no se puede afirmar nada
    let bg = null, unknown = false;
    const stack = [];
    for (let a = el; a; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (as.backgroundImage && as.backgroundImage !== "none") { unknown = true; break; }
      const c = rgba(as.backgroundColor);
      if (c[3] > 0) { stack.push(c); if (c[3] >= 0.99) break; }
    }
    if (unknown) continue;
    bg = stack.reduceRight((acc, c) => over(c, acc), base);
    fg = over(fg, bg);
    const size = parseFloat(s.fontSize);
    const bold = parseInt(s.fontWeight, 10) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const r = ratio(fg, bg);
    const min = large ? 3 : 4.5;
    if (r < min) {
      const t = text(el);
      if (!t || seenText.has(t)) continue;
      seenText.add(t);
      lowContrast.push({ ...desc(el), ratio: Math.floor(r * 100) / 100, min, fg: hex(fg), bg: hex(bg), size: Math.round(size) });
    }
  }
  lowContrast.sort((a, b) => a.ratio - b.ratio);

  // 4) fuentes del tablero que se usan pero no cargaron (sin red, o la familia no existe en Google Fonts)
  const loaded = new Set(Array.from(document.fonts).filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")));
  const usedFirst = new Set();
  for (const el of all.slice(0, 3000)) {
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own) usedFirst.add(getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim());
  }
  usedFirst.add(getComputedStyle(document.body).fontFamily.split(",")[0].replace(/["']/g, "").trim());
  const missingFonts = (opts.fonts || []).filter((f) => usedFirst.has(f) && !loaded.has(f));

  // 5) objetivos táctiles chicos (solo móvil/tablet): < 32 px es difícil de tocar
  const smallTargets = [];
  if (opts.touch) {
    for (const el of document.querySelectorAll("a[href], button, [role=button], input, select, textarea")) {
      if (!visible(el)) continue;
      if (el.closest("p, li") && el.tagName === "A") continue; // enlaces dentro de un párrafo
      const r = el.getBoundingClientRect();
      if (r.width < 32 || r.height < 32) smallTargets.push(desc(el));
      if (smallTargets.length >= 8) break;
    }
  }

  // 6) cajas señalables para los comentarios del lienzo
  const TARGET = "h1,h2,h3,h4,h5,h6,p,a,button,img,svg,input,textarea,select,label,li,nav,header,footer,section,article,figure,blockquote,table,form,[role=button]";
  const targets = [];
  for (const el of document.body.querySelectorAll(TARGET)) {
    if (targets.length >= 900) break;
    if (!visible(el)) continue;
    targets.push(desc(el));
  }
  // bloques de primer nivel (secciones aunque sean <div>)
  const top = document.body.children.length === 1 && document.body.firstElementChild.children.length > 1 ? document.body.firstElementChild.children : document.body.children;
  for (const el of Array.from(top)) if (visible(el) && el.getBoundingClientRect().height > 60) targets.push({ ...desc(el), block: true });

  const tailwind = Array.from(document.querySelectorAll("style")).some((s) => /tailwindcss v4/.test(s.textContent || ""));
  return {
    width: vw,
    height: Math.max(doc.scrollHeight, document.body.scrollHeight),
    tailwind,
    empty: !document.body.innerText.trim() && !document.images.length && !document.querySelector("svg"),
    issues: { overflow, brokenImages, lowContrast: lowContrast.slice(0, 10), missingFonts, smallTargets },
    targets,
  };
}
