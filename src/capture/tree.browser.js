// Corre DENTRO de la página: árbol de layout simplificado de UNA sección (para blueprints).
// Se evalúa como `(${este archivo})({ top, height })`. JS plano por la misma razón que
// extract.browser.js (tsx inyecta helpers que el navegador no tiene).
(({ top, height }) => {
  const vw = window.innerWidth;
  const sy = window.scrollY;
  const cs = (el) => getComputedStyle(el);
  const transparent = (c) => !c || c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
  const px = (v) => Math.round(parseFloat(v) || 0);

  // 1) la sección: el elemento ancho cuya caja coincide con la medida guardada
  let best = null;
  let bestScore = Infinity;
  for (const el of document.body.getElementsByTagName("*")) {
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.5 || r.height < 30) continue;
    const score = Math.abs(r.top + sy - top) + Math.abs(r.height - height);
    if (score < bestScore || (score === bestScore && best && best.contains(el))) {
      bestScore = score;
      best = el;
    }
  }
  if (!best || bestScore > Math.max(80, height * 0.25)) return null;

  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "LINK", "META", "BR"]);
  let budget = 160;

  const ownText = (el) => {
    let t = "";
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent;
    return t.replace(/\s+/g, " ").trim();
  };

  const roleOf = (el, s, r, kids) => {
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) return "heading";
    if (tag === "IMG" || tag === "PICTURE") return "image";
    if (tag === "VIDEO") return "video";
    if (tag === "CANVAS") return "image";
    if (tag === "svg" || tag === "SVG") return r.width > 120 || r.height > 120 ? "image" : "icon";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return "input";
    if (tag === "FORM") return "form";
    const filled = !transparent(s.backgroundColor);
    const bordered = parseFloat(s.borderTopWidth) > 0 && !transparent(s.borderTopColor);
    const txt = (el.innerText || "").trim();
    if ((tag === "A" || tag === "BUTTON" || el.getAttribute("role") === "button") && txt.length <= 40 && (filled || bordered) && r.height <= 80) return "button";
    if (tag === "A" && txt.length <= 60 && !kids.length) return "link";
    if (tag === "UL" || tag === "OL") return "list";
    if (!kids.length && txt) {
      if (s.textTransform === "uppercase" && parseFloat(s.fontSize) <= 14) return "label";
      return "text";
    }
    if ((filled || bordered || parseFloat(s.borderTopLeftRadius) > 4) && kids.length && r.width < vw * 0.9) return "card";
    if (s.backgroundImage !== "none" && !kids.length) return "image";
    return "group";
  };

  const node = (el, depth) => {
    if (budget-- <= 0) return null;
    const s = cs(el);
    if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) < 0.05) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    const leafTag = /^(IMG|PICTURE|VIDEO|CANVAS|SVG|svg|INPUT|TEXTAREA|SELECT|H[1-6])$/.test(el.tagName);
    let kids = [];
    if (!leafTag && depth < 7)
      for (const k of el.children) {
        if (SKIP.has(k.tagName)) continue;
        const n = node(k, depth + 1);
        if (n) kids.push(n);
      }
    const role = roleOf(el, s, r, kids);
    const text = role === "heading" || role === "text" || role === "label" || role === "button" || role === "link" ? (el.innerText || ownText(el)).replace(/\s+/g, " ").trim() : "";
    if (role === "button" || role === "link" || role === "heading") kids = [];

    // columnas reales: hijos alineados en la misma fila
    let cols = 1;
    if (kids.length >= 2) {
      const rows = {};
      for (const k of el.children) {
        const kr = k.getBoundingClientRect();
        if (kr.width < 8 || kr.height < 8) continue;
        const key = Math.round(kr.top / 10);
        rows[key] = (rows[key] || 0) + 1;
      }
      cols = Math.max(1, ...Object.values(rows));
    }
    const n = {
      tag: el.tagName.toLowerCase(),
      role,
      w: Math.round(r.width),
      h: Math.round(r.height),
      display: s.display,
      dir: s.flexDirection,
      cols,
      gap: px(s.rowGap) || px(s.columnGap) || 0,
      colGap: px(s.columnGap),
      align: s.alignItems,
      justify: s.justifyContent,
      textAlign: s.textAlign,
      pad: [px(s.paddingTop), px(s.paddingRight), px(s.paddingBottom), px(s.paddingLeft)],
      maxW: /px$/.test(s.maxWidth) && parseFloat(s.maxWidth) < vw ? px(s.maxWidth) : 0,
      radius: px(s.borderTopLeftRadius),
      bg: transparent(s.backgroundColor) ? "" : s.backgroundColor,
      border: parseFloat(s.borderTopWidth) > 0 && !transparent(s.borderTopColor) ? s.borderTopColor : "",
      shadow: s.boxShadow && s.boxShadow !== "none",
      color: s.color,
      fs: px(s.fontSize),
      fw: parseInt(s.fontWeight, 10) || 400,
      ff: s.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
      lh: s.lineHeight === "normal" ? 1.2 : Math.round((parseFloat(s.lineHeight) / parseFloat(s.fontSize)) * 100) / 100,
      ls: s.letterSpacing === "normal" ? 0 : Math.round((parseFloat(s.letterSpacing) / parseFloat(s.fontSize)) * 1000) / 1000,
      tt: s.textTransform,
      textLen: text.length,
      words: text ? text.split(" ").length : 0,
      children: kids,
    };
    // envoltorios sin estilo propio con un solo hijo: se aplanan
    if (role === "group" && kids.length === 1 && !n.bg && !n.border && !n.maxW && n.pad.every((p) => p < 8)) return kids[0];
    return n;
  };

  const root = node(best, 0);
  if (!root) return null;
  const rs = cs(best);
  let bg = rs.backgroundColor;
  for (let p = best; transparent(bg) && p; p = p.parentElement) bg = cs(p).backgroundColor;
  root.sectionBg = transparent(bg) ? "rgb(255, 255, 255)" : bg;
  return root;
})
