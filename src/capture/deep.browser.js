// Corre DENTRO de la página (ya recorrida y de vuelta arriba): el análisis profundo de la marca.
// Componentes reales agrupados por estilo, ritmo de espaciado, sombras, movimiento, imágenes,
// rejilla, breakpoints y stack. Marca con data-matiz-deep los elementos que Node va a recortar
// y a los que les hará hover. Todo lo que devuelve es medido; nada se infiere del nombre.
(() => {
  const cs = (el) => getComputedStyle(el);
  const vw = innerWidth;
  const sy = scrollY;
  const root = document.documentElement;
  const rcs = cs(root);
  const px = (v) => parseFloat(v) || 0;
  const transparent = (c) => !c || c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
  const text = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  const docRect = (r) => ({ x: Math.round(r.left), y: Math.round(r.top + sy), w: Math.round(r.width), h: Math.round(r.height) });
  const effBg = (el) => {
    for (let n = el; n && n !== root; n = n.parentElement) {
      const b = cs(n).backgroundColor;
      if (!transparent(b)) return b;
    }
    return transparent(rcs.backgroundColor) ? "rgb(255, 255, 255)" : rcs.backgroundColor;
  };
  const inc = (m, k, w = 1) => m.set(k, (m.get(k) || 0) + w);
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));
  const round = (v, s = 1) => Math.round(v / s) * s;
  const family = (s) => s.fontFamily.split(",")[0].replace(/["']/g, "").trim();
  const firstOf = (v) => v.split(/,(?![^(]*\))/)[0].trim();
  const marks = [];
  const mark = (el, key, kind, label) => {
    el.setAttribute("data-matiz-deep", key);
    marks.push({ key, kind, label: (label || "").slice(0, 40) });
    return key;
  };

  // ---------- un recorrido: elementos visibles con su caja y estilo ----------
  const items = [];
  const list = document.body ? document.body.getElementsByTagName("*") : [];
  for (let i = 0; i < list.length && items.length < 9000; i++) {
    const el = list[i];
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const s = cs(el);
    if (s.display === "none" || s.visibility === "hidden" || px(s.opacity) < 0.05) continue;
    items.push({ el, r, s });
  }
  const byEl = new Map(items.map((x) => [x.el, x]));

  // ---------- botones ----------
  const isClickable = (el) => {
    const t = el.tagName;
    return t === "A" || t === "BUTTON" || el.getAttribute("role") === "button" || (t === "INPUT" && /submit|button/.test(el.type));
  };
  const btnStyleEl = (it) => {
    // el fondo a veces lo pinta un hijo único que cubre el enlace (<a><span class="btn">)
    const { el, r, s } = it;
    const own = !transparent(s.backgroundColor) || (px(s.borderTopWidth) > 0 && s.borderTopStyle !== "none" && !transparent(s.borderTopColor));
    if (own) return it;
    if (el.children.length === 1) {
      const c = byEl.get(el.children[0]);
      if (c && c.r.width * c.r.height >= r.width * r.height * 0.85) return c;
    }
    return it;
  };
  const btnGroups = new Map();
  const btnEls = new Set();
  for (const it of items) {
    if (!isClickable(it.el)) continue;
    const { el, r } = it;
    if (r.height < 26 || r.height > 76 || r.width < 40 || r.width > 440) continue;
    const label = text(el) || el.value || el.getAttribute("aria-label") || "";
    if (!label || label.length > 42) continue;
    const st = btnStyleEl(it);
    const s = st.s;
    const parentBg = effBg(st.el.parentElement || st.el);
    const filled = !transparent(s.backgroundColor) && s.backgroundColor !== parentBg;
    const bw = px(s.borderTopWidth);
    const outline = bw > 0 && s.borderTopStyle !== "none" && !transparent(s.borderTopColor);
    if (!filled && !outline) continue;
    if (px(s.paddingLeft) < 6 && px(s.paddingRight) < 6) continue;
    btnEls.add(el);
    const radius = px(s.borderTopLeftRadius);
    const sig = [s.backgroundColor, s.color, outline ? `${bw}px ${s.borderTopColor}` : "", round(radius), round(px(s.fontSize)), s.fontWeight, round(px(s.paddingLeft), 2), round(r.height, 2), s.boxShadow === "none" ? "" : s.boxShadow.slice(0, 80)].join("|");
    const g = btnGroups.get(sig) || {
      kind: filled ? "solid" : "outline",
      count: 0,
      el,
      firstY: r.top + sy,
      label: label.slice(0, 32),
      bg: filled ? s.backgroundColor : "transparent",
      color: s.color,
      border: outline ? `${bw}px ${s.borderTopStyle} ${s.borderTopColor}` : "",
      radius: Math.round(radius),
      pill: radius >= r.height / 2 - 1,
      height: Math.round(r.height),
      padX: Math.round(px(s.paddingLeft)),
      padY: Math.round(px(s.paddingTop)),
      fontSize: px(s.fontSize),
      weight: +s.fontWeight || 400,
      family: family(s),
      letterSpacing: s.letterSpacing === "normal" ? 0 : +(px(s.letterSpacing) / px(s.fontSize)).toFixed(3),
      transform: s.textTransform,
      shadow: s.boxShadow === "none" ? "" : s.boxShadow.slice(0, 200),
      icon: !!el.querySelector("svg, img"),
      gap: px(s.columnGap) || 0,
      transition: s.transitionDuration !== "0s" ? `${firstOf(s.transitionProperty)} ${firstOf(s.transitionDuration)} ${firstOf(s.transitionTimingFunction)}` : "",
    };
    g.count++;
    if (r.top + sy < g.firstY) {
      g.firstY = r.top + sy;
      g.el = el;
      g.label = label.slice(0, 32);
    }
    btnGroups.set(sig, g);
  }
  // el primario: el sólido que aparece más arriba (en el hero) y más se repite
  const buttons = [...btnGroups.values()]
    .sort((a, b) => (a.firstY < 1000 ? 0 : 1) - (b.firstY < 1000 ? 0 : 1) || b.count - a.count || a.firstY - b.firstY)
    .slice(0, 5);
  const firstSolid = buttons.findIndex((b) => b.kind === "solid");
  buttons.forEach((b, i) => {
    b.role = i === firstSolid ? "primary" : b.kind === "outline" ? "secondary" : i < 3 ? "secondary" : "tertiary";
    b.key = mark(b.el, `btn-${i}`, "button", b.label);
    b.firstY = Math.round(b.firstY);
    delete b.el;
  });

  // ---------- barra de navegación ----------
  let nav = null;
  const navCand = items
    .filter(({ el, r }) => r.top + sy < 80 && r.width >= vw * 0.85 && r.height >= 36 && r.height <= 160 && (/^(HEADER|NAV)$/.test(el.tagName) || el.getAttribute("role") === "banner" || /header|navbar|nav-bar|topbar/i.test(String(el.className))))
    .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
  if (navCand) {
    const { el, r, s } = navCand;
    const links = [...el.querySelectorAll("a")].map((a) => byEl.get(a)).filter((x) => x && !btnEls.has(x.el) && x.r.height < 60 && text(x.el).length > 1 && text(x.el).length < 28 && x.r.top + sy < 140);
    const xs = links.map((l) => l.r).sort((a, b) => a.left - b.left);
    const gaps = [];
    for (let i = 1; i < xs.length; i++) {
      const g = xs[i].left - xs[i - 1].right;
      if (g > 0 && g < 80) gaps.push(Math.round(g));
    }
    gaps.sort((a, b) => a - b);
    const l0 = links.find((l) => l.r.width > 20);
    const center = xs.length ? (xs[0].left + xs[xs.length - 1].right) / 2 : 0;
    // fondo real: el de la barra o el primer ancestro con color
    let bg = s.backgroundColor;
    if (transparent(bg)) {
      const inner = [...el.querySelectorAll("*")].slice(0, 30).map((c) => byEl.get(c)).find((c) => c && c.r.width >= r.width * 0.8 && !transparent(c.s.backgroundColor));
      bg = inner ? inner.s.backgroundColor : "transparent";
    }
    const pos = [s.position, ...[...el.querySelectorAll("*")].slice(0, 6).map((c) => cs(c).position)].find((p) => p === "fixed" || p === "sticky") || s.position;
    nav = {
      key: mark(el, "nav", "nav", "nav"),
      height: Math.round(r.height),
      bg,
      translucent: /rgba|\/\s*0?\.\d/.test(bg) && !transparent(bg),
      blur: s.backdropFilter && s.backdropFilter !== "none" ? s.backdropFilter : [...el.querySelectorAll("*")].slice(0, 20).map((c) => cs(c).backdropFilter).find((b) => b && b !== "none") || "",
      position: pos,
      borderBottom: px(s.borderBottomWidth) > 0 ? `${px(s.borderBottomWidth)}px ${s.borderBottomColor}` : "",
      shadow: s.boxShadow === "none" ? "" : s.boxShadow.slice(0, 160),
      links: links.length,
      linkGap: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
      linkSize: l0 ? px(l0.s.fontSize) : null,
      linkWeight: l0 ? +l0.s.fontWeight : null,
      linkColor: l0 ? l0.s.color : null,
      align: !xs.length ? "—" : Math.abs(center - vw / 2) < vw * 0.08 ? "centro" : center > vw / 2 ? "derecha" : "izquierda",
      ctas: [...el.querySelectorAll("a, button")].filter((x) => btnEls.has(x)).length,
      floating: r.left > 8 && r.width < vw - 16,
      radius: Math.round(px(s.borderTopLeftRadius)),
    };
  }

  // ---------- tarjetas ----------
  const cardGroups = new Map();
  for (const it of items) {
    const { el, r, s } = it;
    const rad = px(s.borderTopLeftRadius);
    if (r.width < 180 || r.width > vw * 0.66 || r.height < 110 || r.height > 900) continue;
    const ownBg = !transparent(s.backgroundColor) && s.backgroundColor !== effBg(el.parentElement || el);
    const bw = px(s.borderTopWidth);
    const hasBorder = bw > 0 && s.borderTopStyle !== "none" && !transparent(s.borderTopColor);
    const hasShadow = s.boxShadow && s.boxShadow !== "none";
    if (!(ownBg || hasBorder || hasShadow)) continue;
    if (rad < 2 && !hasShadow && !hasBorder) continue;
    if (!el.querySelector("h2, h3, h4, h5, p")) continue;
    if (btnEls.has(el)) continue;
    const kids = [...el.children].map((c) => byEl.get(c)).filter(Boolean).sort((a, b) => a.r.top - b.r.top);
    const vgaps = [];
    for (let i = 1; i < kids.length; i++) {
      const g = kids[i].r.top - kids[i - 1].r.bottom;
      if (g >= 0 && g < 120) vgaps.push(Math.round(g));
    }
    const media = [...el.querySelectorAll("img, video, picture, canvas, svg")].some((m) => m.getBoundingClientRect().width >= r.width * 0.5);
    const h = el.querySelector("h2, h3, h4, h5");
    const hs = h ? cs(h) : null;
    const sig = [s.backgroundColor, hasBorder ? `${bw}${s.borderTopColor}` : "", round(rad), hasShadow ? s.boxShadow.slice(0, 80) : "", round(px(s.paddingTop), 4)].join("|");
    const g = cardGroups.get(sig) || {
      count: 0,
      el,
      bg: ownBg ? s.backgroundColor : "transparent",
      border: hasBorder ? `${bw}px ${s.borderTopStyle} ${s.borderTopColor}` : "",
      radius: Math.round(rad),
      shadow: hasShadow ? s.boxShadow.slice(0, 220) : "",
      padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map((v) => Math.round(px(v))),
      gap: vgaps.length ? vgaps.sort((a, b) => a - b)[Math.floor(vgaps.length / 2)] : null,
      media,
      w: Math.round(r.width),
      h: Math.round(r.height),
      title: hs ? { size: px(hs.fontSize), weight: +hs.fontWeight, family: family(hs) } : null,
      transition: s.transitionDuration !== "0s" ? `${firstOf(s.transitionProperty)} ${firstOf(s.transitionDuration)} ${firstOf(s.transitionTimingFunction)}` : "",
      area: 0,
    };
    g.count++;
    g.area += r.width * r.height;
    cardGroups.set(sig, g);
  }
  // una tarjeta y su contenedor pueden coincidir: se quedan las más repetidas, sin anidarse entre sí
  const cards = [];
  for (const g of [...cardGroups.values()].sort((a, b) => b.count - a.count || b.area - a.area)) {
    if (cards.some((c) => c.el.contains(g.el) || g.el.contains(c.el))) continue;
    cards.push(g);
    if (cards.length >= 4) break;
  }
  cards.forEach((c, i) => {
    c.key = mark(c.el, `card-${i}`, "card", "card");
    delete c.el;
    delete c.area;
  });

  // ---------- badges, pills y etiquetas ----------
  const badgeGroups = new Map();
  for (const it of items) {
    const { el, r, s } = it;
    if (r.height < 16 || r.height > 36 || r.width < 22 || r.width > 320 || btnEls.has(el)) continue;
    const t = text(el);
    if (!t || t.length > 40 || el.querySelectorAll("*").length > 8) continue;
    if (px(s.fontSize) > 15) continue;
    const ownBg = !transparent(s.backgroundColor) && s.backgroundColor !== effBg(el.parentElement || el);
    const bw = px(s.borderTopWidth);
    const hasBorder = bw > 0 && s.borderTopStyle !== "none" && !transparent(s.borderTopColor);
    if (!ownBg && !hasBorder) continue;
    if (px(s.paddingLeft) < 4) continue;
    const rad = px(s.borderTopLeftRadius);
    const sig = [s.backgroundColor, s.color, hasBorder ? s.borderTopColor : "", round(rad), round(px(s.fontSize))].join("|");
    const g = badgeGroups.get(sig) || {
      count: 0,
      el,
      label: t.slice(0, 30),
      bg: ownBg ? s.backgroundColor : "transparent",
      color: s.color,
      border: hasBorder ? `${bw}px ${s.borderTopStyle} ${s.borderTopColor}` : "",
      radius: Math.round(rad),
      pill: rad >= r.height / 2 - 1,
      height: Math.round(r.height),
      padX: Math.round(px(s.paddingLeft)),
      fontSize: px(s.fontSize),
      weight: +s.fontWeight,
      transform: s.textTransform,
      letterSpacing: s.letterSpacing === "normal" ? 0 : +(px(s.letterSpacing) / px(s.fontSize)).toFixed(3),
      y: Math.round(r.top + sy),
      link: !!el.closest("a"),
    };
    g.count++;
    badgeGroups.set(sig, g);
  }
  const badges = [...badgeGroups.values()].sort((a, b) => b.count - a.count || a.y - b.y).slice(0, 3);
  badges.forEach((b, i) => {
    b.key = mark(b.el, `badge-${i}`, "badge", b.label);
    delete b.el;
  });

  // ---------- input ----------
  let input = null;
  for (const el of document.querySelectorAll('input[type="email"], input[type="text"], input[type="search"], input:not([type]), textarea')) {
    const it = byEl.get(el);
    if (!it) continue;
    const { r, s } = it;
    if (r.height > 80 || r.width < 120 || (transparent(s.backgroundColor) && !(px(s.borderTopWidth) > 0) && !(px(s.borderBottomWidth) > 0))) continue;
    input = {
      key: mark(el, "input", "input", el.getAttribute("placeholder") || "input"),
      bg: s.backgroundColor,
      color: s.color,
      border: `${px(s.borderTopWidth)}px ${s.borderTopStyle} ${s.borderTopColor}`,
      radius: Math.round(px(s.borderTopLeftRadius)),
      height: Math.round(r.height),
      padX: Math.round(px(s.paddingLeft)),
      fontSize: px(s.fontSize),
      placeholder: (el.getAttribute("placeholder") || "").slice(0, 40),
      shadow: s.boxShadow === "none" ? "" : s.boxShadow.slice(0, 160),
    };
    break;
  }

  // ---------- link de texto ----------
  let link = null;
  for (const a of document.querySelectorAll("p a, li a, article a, footer a")) {
    const it = byEl.get(a);
    if (!it || btnEls.has(a)) continue;
    const s = it.s;
    if (!transparent(s.backgroundColor) || px(s.borderTopWidth) > 0 || text(a).length < 3) continue;
    link = { key: mark(a, "link", "link", text(a)), color: s.color, decoration: s.textDecorationLine, thickness: s.textDecorationThickness, offset: s.textUnderlineOffset, weight: +s.fontWeight, size: px(s.fontSize) };
    break;
  }

  // ---------- encabezados de sección: antetítulo + título + subtítulo ----------
  const headStyle = (el) => {
    const s = cs(el);
    const r = el.getBoundingClientRect();
    return {
      text: text(el).slice(0, 70),
      family: family(s),
      size: px(s.fontSize),
      weight: +s.fontWeight,
      lh: s.lineHeight === "normal" ? 1.2 : +(px(s.lineHeight) / px(s.fontSize)).toFixed(2),
      ls: s.letterSpacing === "normal" ? 0 : +(px(s.letterSpacing) / px(s.fontSize)).toFixed(3),
      transform: s.textTransform,
      color: s.color,
      width: Math.round(r.width),
      gradient: /gradient/.test(s.backgroundImage) && /text/.test(s.webkitBackgroundClip || s.backgroundClip) ? s.backgroundImage.slice(0, 200) : "",
      style: s.fontStyle,
    };
  };
  const headings = {};
  for (const tag of ["h1", "h2", "h3", "h4"]) {
    // fuera los títulos ocultos para lectores de pantalla (1 px, recortados)
    const els = [...document.querySelectorAll(tag)].filter((e) => byEl.has(e) && text(e).length > 2 && byEl.get(e).r.width > 24 && byEl.get(e).r.height > 10);
    if (!els.length) continue;
    // h1: el más grande; los demás, el estilo más repetido
    if (tag === "h1") {
      els.sort((a, b) => px(cs(b).fontSize) - px(cs(a).fontSize));
      headings.h1 = { ...headStyle(els[0]), count: els.length };
    } else {
      const m = new Map();
      for (const e of els) {
        const s = cs(e);
        const k = `${round(px(s.fontSize))}|${s.fontWeight}|${family(s)}`;
        const x = m.get(k) || { n: 0, e };
        x.n++;
        m.set(k, x);
      }
      const best = [...m.values()].sort((a, b) => b.n - a.n)[0];
      headings[tag] = { ...headStyle(best.e), count: els.length };
    }
  }
  const pEls = [...document.querySelectorAll("p")].filter((e) => byEl.has(e) && text(e).length > 40);
  if (pEls.length) {
    const m = new Map();
    for (const e of pEls) {
      const s = cs(e);
      const k = `${round(px(s.fontSize))}|${s.fontWeight}`;
      const x = m.get(k) || { n: 0, e };
      x.n += text(e).length;
      m.set(k, x);
    }
    const best = [...m.values()].sort((a, b) => b.n - a.n)[0].e;
    const hs = headStyle(best);
    hs.text = hs.text.slice(0, 60);
    headings.body = { ...hs, maxCh: Math.round(best.getBoundingClientRect().width / (px(cs(best).fontSize) * 0.5)) };
  }
  // patrón de encabezado de sección
  let eyebrows = 0;
  let centered = 0;
  let subtitled = 0;
  let headerKey = null;
  let eyebrow = null;
  const h2s = [...document.querySelectorAll("h2")].filter((e) => byEl.has(e)).slice(0, 16);
  for (const h of h2s) {
    const prev = h.previousElementSibling || (h.parentElement && h.parentElement.firstElementChild !== h ? null : h.parentElement && h.parentElement.previousElementSibling);
    const next = h.nextElementSibling;
    const hs = cs(h);
    const pr = h.parentElement ? h.parentElement.getBoundingClientRect() : null;
    const hr = h.getBoundingClientRect();
    const isCenter = hs.textAlign === "center" || (pr && hr.width < pr.width * 0.92 && Math.abs(hr.left + hr.width / 2 - (pr.left + pr.width / 2)) < 12);
    if (isCenter) centered++;
    let eb = null;
    if (prev && byEl.has(prev)) {
      const ps = cs(prev);
      const t = text(prev);
      if (t && t.length <= 40 && px(ps.fontSize) <= 16 && px(ps.fontSize) < px(hs.fontSize) * 0.6) eb = prev;
    }
    if (eb) {
      eyebrows++;
      if (!eyebrow) {
        const es = cs(eb);
        eyebrow = { text: text(eb).slice(0, 30), size: px(es.fontSize), weight: +es.fontWeight, transform: es.textTransform, ls: es.letterSpacing === "normal" ? 0 : +(px(es.letterSpacing) / px(es.fontSize)).toFixed(3), color: es.color, bg: transparent(es.backgroundColor) ? "" : es.backgroundColor, radius: Math.round(px(es.borderTopLeftRadius)), family: family(es) };
      }
    }
    const hasSub = next && next.tagName === "P" && text(next).length > 20;
    if (hasSub) subtitled++;
    if (!headerKey && (eb || hasSub) && h.parentElement && h.parentElement.getBoundingClientRect().height < 520) headerKey = mark(h.parentElement, "header", "header", text(h));
  }
  const sectionHeader = h2s.length ? { total: h2s.length, eyebrowShare: +(eyebrows / h2s.length).toFixed(2), centeredShare: +(centered / h2s.length).toFixed(2), subtitleShare: +(subtitled / h2s.length).toFixed(2), eyebrow, key: headerKey } : null;

  // ---------- espaciado ----------
  const gaps = new Map();
  const pads = new Map();
  const margins = new Map();
  for (const { el, s } of items) {
    if (/flex|grid/.test(s.display)) {
      const rg = px(s.rowGap);
      const cg = px(s.columnGap);
      if (rg > 0 && rg <= 240) inc(gaps, round(rg, 0.5));
      if (cg > 0 && cg <= 240 && cg !== rg) inc(gaps, round(cg, 0.5));
    }
    for (const v of [s.paddingTop, s.paddingLeft]) {
      const p = px(v);
      if (p > 0 && p <= 240) inc(pads, round(p, 0.5));
    }
    if (/^(H[1-6]|P|UL|OL|FIGURE|BLOCKQUOTE)$/.test(el.tagName)) {
      const m = px(s.marginBottom) || px(s.marginTop);
      if (m > 0 && m <= 200) inc(margins, round(m, 0.5));
    }
  }
  const allSpace = new Map();
  for (const m of [gaps, pads, margins]) for (const [k, v] of m) inc(allSpace, k, v);
  let totalSp = 0;
  let by8 = 0;
  let by4 = 0;
  for (const [k, v] of allSpace) {
    totalSp += v;
    if (k % 8 === 0) by8 += v;
    if (k % 4 === 0) by4 += v;
  }
  const share8 = totalSp ? by8 / totalSp : 0;
  const share4 = totalSp ? by4 / totalSp : 0;
  const base = share8 >= 0.7 ? 8 : share4 >= 0.72 ? 4 : share4 >= 0.5 ? 4 : 0;
  const scale = [...allSpace.entries()].filter(([k, v]) => v >= 3 && k >= 2).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k]) => k).sort((a, b) => a - b);

  // ritmo de secciones: el contenedor cuyos hijos directos son bloques a lo ancho
  let sectionParent = null;
  let bestKids = 0;
  for (const { el, r } of items) {
    if (r.width < vw * 0.9) continue;
    let n = 0;
    for (const c of el.children) {
      const ci = byEl.get(c);
      if (ci && ci.r.width >= vw * 0.9 && ci.r.height >= 160) n++;
    }
    if (n > bestKids) {
      bestKids = n;
      sectionParent = el;
    }
  }
  const rhythm = [];
  if (sectionParent && bestKids >= 3) {
    for (const c of sectionParent.children) {
      const ci = byEl.get(c);
      if (!ci || ci.r.width < vw * 0.9 || ci.r.height < 160) continue;
      let minT = Infinity;
      let maxB = -Infinity;
      let minL = Infinity;
      let maxR = -Infinity;
      const inner = c.querySelectorAll("h1, h2, h3, h4, p, img, video, svg, a, button, li, canvas, picture");
      for (let i = 0; i < inner.length && i < 400; i++) {
        const ii = byEl.get(inner[i]);
        if (!ii || ii.r.width < 8 || ii.r.height < 8) continue;
        if (ii.r.width >= vw * 0.98 && ii.el.tagName !== "P") continue; // fondos a sangre no cuentan
        minT = Math.min(minT, ii.r.top);
        maxB = Math.max(maxB, ii.r.bottom);
        minL = Math.min(minL, Math.max(ii.r.left, ci.r.left));
        maxR = Math.max(maxR, Math.min(ii.r.right, ci.r.right));
      }
      if (minT === Infinity) continue;
      rhythm.push({
        y: Math.round(ci.r.top + sy),
        h: Math.round(ci.r.height),
        padTop: Math.max(0, Math.round(minT - ci.r.top)),
        padBottom: Math.max(0, Math.round(ci.r.bottom - maxB)),
        inner: Math.round(maxR - minL),
        bg: effBg(c),
      });
      if (rhythm.length >= 24) break;
    }
  }
  // contenedor: max-width centrado
  const containers = new Map();
  let gutter = null;
  for (const { el, r, s } of items) {
    const mw = px(s.maxWidth);
    if (!mw || mw < 640 || mw > 2000 || r.width < 500) continue;
    const pr = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
    if (!pr) continue;
    const l = r.left - pr.left;
    const rt = pr.right - r.right;
    if (Math.abs(l - rt) > 4) continue;
    inc(containers, Math.round(mw), r.height);
    if (gutter === null && px(s.paddingLeft) > 0) gutter = Math.round(px(s.paddingLeft));
  }
  const spacing = {
    base,
    share8: +share8.toFixed(2),
    share4: +share4.toFixed(2),
    scale,
    gaps: top(gaps, 10),
    paddings: top(pads, 10),
    margins: top(margins, 8),
    rhythm,
    container: top(containers, 3).map((x) => x.value),
    gutter,
  };

  // ---------- sombras, radios, bordes ----------
  const kindOf = (el) => (btnEls.has(el) ? "botón" : el.getAttribute("data-matiz-deep")?.startsWith("card") ? "tarjeta" : /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ? "input" : /^(IMG|PICTURE|VIDEO)$/.test(el.tagName) ? "imagen" : /^(HEADER|NAV)$/.test(el.tagName) ? "nav" : "caja");
  const shadowMap = new Map();
  const radiusBy = { botón: new Map(), tarjeta: new Map(), imagen: new Map(), input: new Map(), caja: new Map(), nav: new Map() };
  const borderW = new Map();
  const borderC = new Map();
  let textShadows = 0;
  let dropShadows = 0;
  for (const { el, r, s } of items) {
    const k = kindOf(el);
    if (s.boxShadow && s.boxShadow !== "none") {
      const e = shadowMap.get(s.boxShadow) || { value: s.boxShadow.slice(0, 300), count: 0, kinds: new Map(), area: 0 };
      e.count++;
      e.area += r.width * r.height;
      inc(e.kinds, k);
      shadowMap.set(s.boxShadow, e);
    }
    const rad = px(s.borderTopLeftRadius);
    if (rad > 0 && r.width > 16) inc(radiusBy[k] || radiusBy.caja, rad >= Math.min(r.width, r.height) / 2 - 1 ? 9999 : Math.round(rad));
    const bw = px(s.borderTopWidth) || px(s.borderBottomWidth);
    if (bw > 0 && s.borderTopStyle !== "none" && r.width > 20) {
      inc(borderW, bw);
      if (!transparent(s.borderTopColor)) inc(borderC, s.borderTopColor);
    }
    if (s.textShadow && s.textShadow !== "none") textShadows++;
    if (/drop-shadow/.test(s.filter)) dropShadows++;
  }
  // capas: anillo (0 0 0 Npx), interior (inset) o caída
  const layerKind = (l) => {
    const nums = (l.replace(/rgba?\([^)]*\)|oklch\([^)]*\)|#[0-9a-f]+|hsla?\([^)]*\)/gi, "").match(/-?[\d.]+px/g) || []).map(parseFloat);
    const [x = 0, y = 0, blur = 0, spread = 0] = nums;
    return { inset: /inset/.test(l), ring: x === 0 && y === 0 && blur === 0 && spread !== 0, x, y, blur, spread };
  };
  const shadows = [...shadowMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((e) => {
      const layers = e.value.split(/,(?![^(]*\))/).map((l) => l.trim());
      const ks = layers.map(layerKind);
      const elev = Math.max(0, ...ks.filter((k) => !k.inset && !k.ring).map((k) => Math.abs(k.y) + k.blur / 2));
      return { value: e.value, count: e.count, kinds: top(e.kinds, 3).map((x) => x.value), layers: layers.length, type: ks.every((k) => k.ring) ? "anillo" : ks.every((k) => k.inset) ? "interior" : ks.some((k) => k.ring) ? "caída + anillo" : "caída", elevation: Math.round(elev) };
    });
  const radii = Object.fromEntries(Object.entries(radiusBy).map(([k, m]) => [k, top(m, 4)]).filter(([, v]) => v.length));

  // ---------- efectos ----------
  const fx = { glass: 0, glassSample: "", gradientText: 0, gradientTextSample: "", blend: 0, blurBlobs: 0, masks: 0, clips: 0, sticky: 0, textShadows, dropShadows, gradientBorders: 0, noise: 0 };
  for (const { el, r, s } of items) {
    if (s.backdropFilter && s.backdropFilter !== "none") {
      fx.glass++;
      if (!fx.glassSample) fx.glassSample = `${s.backdropFilter} · ${s.backgroundColor}`;
    }
    if (/gradient/.test(s.backgroundImage) && /text/.test(s.webkitBackgroundClip || s.backgroundClip || "")) {
      fx.gradientText++;
      if (!fx.gradientTextSample) fx.gradientTextSample = s.backgroundImage.slice(0, 260);
    }
    if (s.mixBlendMode && s.mixBlendMode !== "normal") fx.blend++;
    if (/blur\((?!0)/.test(s.filter) && r.width > 120) fx.blurBlobs++;
    if ((s.maskImage && s.maskImage !== "none") || (s.webkitMaskImage && s.webkitMaskImage !== "none")) fx.masks++;
    if (s.clipPath && s.clipPath !== "none") fx.clips++;
    if (s.position === "sticky") fx.sticky++;
    if (/gradient/.test(s.borderImageSource || "") || (/gradient/.test(s.backgroundImage) && /border-box/.test(s.backgroundOrigin) && px(s.borderTopWidth) > 0)) fx.gradientBorders++;
    if (/noise|grain/i.test(s.backgroundImage)) fx.noise++;
    if (el.tagName === "svg" && el.querySelector("feTurbulence")) fx.noise++;
  }

  // ---------- movimiento (lo estático: transiciones, keyframes, animaciones vivas) ----------
  const tProps = new Map();
  const tDur = new Map();
  const tEase = new Map();
  let withTransition = 0;
  for (const { s } of items) {
    if (!s.transitionDuration || s.transitionDuration === "0s") continue;
    const durs = s.transitionDuration.split(",").map((x) => x.trim());
    if (durs.every((d) => d === "0s")) continue;
    withTransition++;
    const props = s.transitionProperty.split(",").map((x) => x.trim());
    const eases = s.transitionTimingFunction.split(/,(?![^(]*\))/).map((x) => x.trim());
    props.forEach((p, i) => {
      const d = durs[i % durs.length];
      if (d === "0s") return;
      inc(tProps, p);
      inc(tDur, d.endsWith("ms") ? `${parseFloat(d) / 1000}s` : d);
      inc(tEase, eases[i % eases.length]);
    });
  }
  const keyframes = [];
  const breakpoints = new Map();
  let containerQueries = 0;
  let darkCss = false;
  let reducedMotionCss = false;
  let focusVisible = "";
  let selection = "";
  let scrollbar = false;
  const visit = (rules) => {
    for (const r of rules) {
      try {
        if (r.type === 7 || r.constructor.name === "CSSKeyframesRule") {
          if (keyframes.length < 60 && !keyframes.some((k) => k.name === r.name)) {
            const props = new Set();
            for (const k of r.cssRules) for (let i = 0; i < k.style.length; i++) props.add(k.style[i].replace(/^-webkit-/, ""));
            keyframes.push({ name: r.name, steps: r.cssRules.length, props: [...props].slice(0, 6) });
          }
          continue;
        }
        if (r.media && r.conditionText !== undefined && r.cssRules && r.constructor.name === "CSSMediaRule") {
          const c = r.conditionText || r.media.mediaText;
          for (const m of c.matchAll(/(min|max)-width:\s*([\d.]+)(px|em|rem)/g)) inc(breakpoints, Math.round(parseFloat(m[2]) * (m[3] === "px" ? 1 : 16)));
          if (/prefers-color-scheme:\s*dark/.test(c)) darkCss = true;
          if (/prefers-reduced-motion/.test(c)) reducedMotionCss = true;
        }
        if (r.constructor.name === "CSSContainerRule") containerQueries++;
        if (r.selectorText) {
          if (/\.dark\b|\[data-theme=["']?dark|\[data-mode=["']?dark|\[data-color-scheme=["']?dark/.test(r.selectorText)) darkCss = true;
          if (!focusVisible && /:focus-visible/.test(r.selectorText) && r.style && (r.style.outline || r.style.boxShadow)) focusVisible = (r.style.outline || r.style.boxShadow).slice(0, 120);
          if (!selection && /::selection/.test(r.selectorText) && r.style.backgroundColor) selection = r.style.backgroundColor;
          if (/::-webkit-scrollbar/.test(r.selectorText)) scrollbar = true;
        }
        if (r.cssRules) visit(r.cssRules);
      } catch (e) {}
    }
  };
  for (const sh of document.styleSheets) {
    try {
      visit(sh.cssRules);
    } catch (e) {}
  }
  if (rcs.scrollbarColor && rcs.scrollbarColor !== "auto") scrollbar = true;
  const live = new Map();
  let liveCount = 0;
  let infinite = 0;
  try {
    for (const a of document.getAnimations()) {
      liveCount++;
      const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
      const name = a.animationName || a.transitionProperty || "";
      const type = a.constructor.name === "CSSAnimation" ? "css" : a.constructor.name === "CSSTransition" ? "transición" : "js";
      if (t.iterations === Infinity) infinite++;
      const props = a.effect && a.effect.getKeyframes ? [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !["offset", "easing", "composite", "computedOffset"].includes(x))))].slice(0, 5) : [];
      const key = `${type}|${name}|${props.join(",")}`;
      const e = live.get(key) || { type, name, props, duration: typeof t.duration === "number" ? Math.round(t.duration) : null, easing: t.easing || "", infinite: t.iterations === Infinity, count: 0 };
      e.count++;
      live.set(key, e);
    }
  } catch (e) {}
  let scrollTimeline = 0;
  let viewTransitionNames = 0;
  for (const { s } of items) {
    if (s.animationTimeline && s.animationTimeline !== "auto") scrollTimeline++;
    if (s.viewTransitionName && s.viewTransitionName !== "none") viewTransitionNames++;
  }

  // ---------- librerías y stack ----------
  const html = document.documentElement.outerHTML.slice(0, 400000);
  const scripts = [...document.scripts].map((s) => s.src).join(" ");
  const has = (re) => re.test(html) || re.test(scripts);
  const libs = [];
  if (window.gsap || has(/gsap(\.min)?\.js|\/gsap@|ScrollTrigger/)) libs.push("GSAP");
  if (window.ScrollTrigger || has(/ScrollTrigger/)) libs.push("ScrollTrigger");
  if (has(/data-framer-|framer-motion|__framer/) || document.querySelector("[data-projection-id], [data-framer-appear-id]")) libs.push(document.querySelector("[data-framer-component-type], [data-framer-name]") ? "Framer (sitio)" : "Framer Motion");
  if (window.Lenis || root.classList.contains("lenis") || has(/lenis/)) libs.push("Lenis (scroll suave)");
  if (has(/locomotive-scroll|data-scroll-container/)) libs.push("Locomotive Scroll");
  if (document.querySelector("lottie-player, dotlottie-player, dotlottie-wc") || window.lottie || window.bodymovin || has(/lottie/i)) libs.push("Lottie");
  if (document.querySelector("[data-aos]")) libs.push("AOS");
  if (window.THREE || has(/three(\.module)?(\.min)?\.js|three@/)) libs.push("Three.js");
  if (document.querySelector("spline-viewer") || has(/splinetool|spline\.design/)) libs.push("Spline");
  if (has(/rive\.app|@rive-app|rive\.wasm/)) libs.push("Rive");
  if (document.querySelector("[data-w-id]")) libs.push("Webflow Interactions");
  if (window.anime) libs.push("anime.js");
  if (window.Swiper || document.querySelector(".swiper")) libs.push("Swiper");
  if (has(/motion\.dev|@motionone|motion@/)) libs.push("Motion One");
  const stack = [];
  const gen = (document.querySelector('meta[name="generator"]') || {}).content || "";
  if (window.__NEXT_DATA__ || has(/\/_next\//)) stack.push("Next.js");
  if (window.__NUXT__ || has(/\/_nuxt\//)) stack.push("Nuxt");
  if (has(/astro-island|data-astro-/)) stack.push("Astro");
  if (window.___gatsby || has(/___gatsby/)) stack.push("Gatsby");
  if (has(/\/_app\/immutable\/|__sveltekit/)) stack.push("SvelteKit");
  if (has(/data-framer-|framerusercontent/)) stack.push("Framer");
  if (document.querySelector("html[data-wf-site], html[data-wf-page]")) stack.push("Webflow");
  if (window.Shopify || has(/cdn\.shopify\.com/)) stack.push("Shopify");
  if (has(/wp-content|wp-includes/)) stack.push("WordPress");
  if (has(/static1\.squarespace|squarespace-cdn/)) stack.push("Squarespace");
  if (document.querySelector("#__next, [data-reactroot]") || window.React) if (!stack.includes("Next.js") && !stack.includes("Gatsby")) stack.push("React");
  // Tailwind: utilidades con variantes o escalas numéricas
  let tw = 0;
  const cls = [...document.querySelectorAll("[class]")].slice(0, 1500).map((e) => (typeof e.className === "string" ? e.className : "")).join(" ").split(/\s+/);
  for (const c of cls) if (/^(sm|md|lg|xl|2xl|hover|dark|group-hover):|^(px|py|pt|pb|mt|mb|gap|text|bg|rounded|w|h)-(\d|\[|xs|sm|md|lg|xl|full)/.test(c)) tw++;
  if (tw > 60) stack.push("Tailwind CSS");
  if (cls.filter((c) => /^sc-[a-zA-Z]{5,}/.test(c)).length > 10) stack.push("styled-components");
  if (cls.filter((c) => /^css-[a-z0-9]{5,}$/.test(c)).length > 20) stack.push("Emotion");
  if (cls.filter((c) => /^[A-Za-z]+_[A-Za-z]+__[A-Za-z0-9_-]{5}$/.test(c)).length > 20) stack.push("CSS Modules");
  if (document.querySelector("[class*='chakra-']")) stack.push("Chakra UI");
  if (document.querySelector("[class*='Mui']")) stack.push("Material UI");
  if (document.querySelector("[data-radix-collection-item], [data-radix-popper-content-wrapper]") || has(/radix-/)) stack.push("Radix");
  if (gen) stack.push(gen.slice(0, 40));

  // ---------- imágenes ----------
  const ratios = new Map();
  const formats = new Map();
  const imgRadius = new Map();
  let images = 0;
  let large = 0;
  let avatars = 0;
  let grayscale = 0;
  let cover = 0;
  let videos = 0;
  let canvases = 0;
  let illustrations = 0;
  let iconCount = 0;
  const iconSizes = new Map();
  let stroked = 0;
  const RAT = [[1, "1:1"], [4 / 3, "4:3"], [3 / 2, "3:2"], [16 / 10, "16:10"], [16 / 9, "16:9"], [21 / 9, "21:9"], [3 / 4, "3:4"], [2 / 3, "2:3"], [9 / 16, "9:16"]];
  for (const { el, r, s } of items) {
    const tag = el.tagName;
    if (tag === "IMG" && r.width >= 40 && r.height >= 24) {
      images++;
      if (r.width >= vw * 0.3) large++;
      const rad = px(s.borderTopLeftRadius);
      if (rad >= Math.min(r.width, r.height) / 2 - 1 && r.width <= 72 && Math.abs(r.width - r.height) < 4) avatars++;
      else inc(imgRadius, Math.round(rad));
      if (/grayscale/.test(s.filter)) grayscale++;
      if (s.objectFit === "cover") cover++;
      if (r.width >= 120) {
        const q = r.width / r.height;
        const best = RAT.reduce((a, b) => (Math.abs(Math.log(q / b[0])) < Math.abs(Math.log(q / a[0])) ? b : a));
        inc(ratios, Math.abs(Math.log(q / best[0])) < 0.06 ? best[1] : "libre");
      }
      const src = (el.currentSrc || el.src || "").split("?")[0].toLowerCase();
      const ext = (src.match(/\.(avif|webp|png|jpe?g|gif|svg)$/) || [])[1] || (/format=(avif|webp)|fm=(avif|webp)|auto=format/.exec(el.currentSrc || "") ? "optimizada" : "otra");
      inc(formats, ext === "jpeg" ? "jpg" : ext);
    }
    if (tag === "VIDEO" && r.width >= 120) videos++;
    if (tag === "CANVAS" && r.width >= 160) canvases++;
    if (tag === "svg") {
      if (r.width <= 32 && r.height <= 32) {
        iconCount++;
        inc(iconSizes, Math.round(r.width));
        const p = el.querySelector("path, circle, line, polyline, rect");
        const st = p ? cs(p) : null;
        if (st && st.stroke && st.stroke !== "none" && (st.fill === "none" || st.fill === "rgba(0, 0, 0, 0)")) stroked++;
      } else if (r.width >= 160 && r.height >= 120) illustrations++;
    }
  }
  const imagery = {
    images,
    large,
    avatars,
    videos,
    canvases,
    illustrations,
    grayscaleShare: images ? +(grayscale / images).toFixed(2) : 0,
    coverShare: images ? +(cover / images).toFixed(2) : 0,
    ratios: top(ratios, 6),
    formats: top(formats, 5),
    radius: top(imgRadius, 4),
    icons: { count: iconCount, sizes: top(iconSizes, 4), style: iconCount < 4 ? "—" : stroked / iconCount >= 0.5 ? "trazo" : "relleno", strokeShare: iconCount ? +(stroked / iconCount).toFixed(2) : 0 },
  };

  // ---------- rejilla ----------
  const cols = new Map();
  for (const { el, r, s } of items) {
    if (r.width < 480) continue;
    if (s.display === "grid" || s.display === "inline-grid") {
      const n = s.gridTemplateColumns.split(/\s+(?![^(]*\))/).filter((x) => /px/.test(x)).length;
      if (n >= 2 && n <= 12 && el.children.length >= 2) inc(cols, n);
    } else if (/flex/.test(s.display) && s.flexDirection === "row" && el.children.length >= 3 && el.children.length <= 8) {
      const ws = [...el.children].map((c) => byEl.get(c)).filter(Boolean).map((c) => c.r.width);
      if (ws.length >= 3 && Math.max(...ws) / Math.min(...ws) < 1.12 && Math.min(...ws) > 120) inc(cols, ws.length);
    }
  }

  // ---------- extras de identidad ----------
  const bodyCs = cs(document.body);
  const cursor = [...new Set(items.slice(0, 400).map((x) => x.s.cursor).filter((c) => /url\(|none/.test(c)))].length > 0;
  const smooth = rcs.scrollBehavior === "smooth" || bodyCs.scrollBehavior === "smooth";

  return {
    viewport: { w: vw, h: innerHeight },
    pageHeight: Math.round(document.documentElement.scrollHeight),
    elements: items.length,
    buttons,
    nav,
    cards,
    badges,
    input,
    link,
    headings,
    sectionHeader,
    spacing,
    shadows,
    radii,
    borders: { widths: top(borderW, 4), colors: top(borderC, 5) },
    effects: fx,
    motion: {
      withTransition,
      transitionShare: +(withTransition / Math.max(1, items.length)).toFixed(3),
      properties: top(tProps, 8),
      durations: top(tDur, 6),
      easings: top(tEase, 5),
      keyframes: keyframes.slice(0, 30),
      keyframeCount: keyframes.length,
      live: [...live.values()].sort((a, b) => b.count - a.count).slice(0, 12),
      liveCount,
      infinite,
      scrollTimeline,
      viewTransitions: viewTransitionNames,
      smoothScroll: smooth,
      reducedMotionCss,
      libs: [...new Set(libs)],
    },
    imagery,
    grid: { columns: top(cols, 6) },
    // 734/735/736 son el mismo corte (min/max con ±1px): se funden y gana el más usado
    breakpoints: (() => {
      const out = [];
      for (const { value } of top(breakpoints, 30)) if (!out.some((v) => Math.abs(v - value) <= 4)) out.push(value);
      return out.slice(0, 10).sort((a, b) => a - b);
    })(),
    containerQueries,
    stack: [...new Set(stack)],
    a11y: { focusVisible, reducedMotionCss, darkCss, selection, scrollbar, customCursor: cursor },
    marks,
  };
})();
