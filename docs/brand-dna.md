# ADN de marca

Objetivo: que Matiz pueda **replicar el branding de cualquier sitio** y que cada marca del catálogo
(`/explorar/#<marca>`) explique, de un vistazo, qué la hace única.

## Especificación (lo que se construye)

1. **Tokens declarados + medidos.** Las variables CSS que el sitio define en `:root`/`html`/`[data-theme]`,
   con su nombre original. Las hojas de otros dominios se descargan desde Node, porque el navegador
   bloquea leerlas. Se resuelven a su valor final y se ordenan por rol según el nombre: primary, background,
   border, muted… Las escalas `blue-50…900` se agrupan.
2. **Color:** cada rol con su contraste WCAG sobre el fondo y **la variable de la que sale**, la escala 50–950
   del acento y los degradados en uso.
3. **Tipografía:** escalera real de tamaños con el porcentaje de texto en cada uno, pesos, tracking e
   interlineado. Las fuentes cargadas llevan sus pesos, origen (Google o propia) y alternativa libre. El
   espécimen se renderiza con la alternativa libre.
4. **Forma y espacio:** radios, sombras, escala de espaciado y bordes, como muestras aplicadas.
5. **Componentes medidos:** botón primario y secundario, tarjeta (fondo, borde, radio, sombra, padding),
   input, link y movimiento (duración y curva).
6. **Identidad:** el logo (el SVG del header se sirve como data URI dentro de un `<img>`, así no puede
   ejecutar nada) y el favicon.
7. **"Lo que la hace única":** percentiles frente al corpus (display, tracking, saturación del acento,
   radio, amplitud de paleta, base, largo de la portada, ancho) más rarezas (combinación tipográfica,
   tema oscuro, serif). Siempre con número.
8. **Composición:** el orden de secciones a escala con su fondo real y el ancho de contenido.
9. **Exportes:** variables CSS, Tailwind v4 `@theme`, DTCG y DESIGN.md. En el MCP: `get_brand_kit`.

Criterio: todo valor visible sale de la página medida. Lo que no se midió no aparece.

Código: `src/capture/brand.browser.js` (extracción), `src/analysis/system.ts` (tokens, escala, fuentes),
`src/analysis/uniqueness.ts`, `src/analysis/exports.ts`, `scripts/build-explore.ts` → `brands/<host>.json`.

## Qué hay en el mercado (investigación, 2026-10-08)

| Herramienta | Qué da | Lo que le falta |
|---|---|---|
| **dembrandt** (MIT, 3,6k★) | Colores con rol, variables CSS, fuentes con URL, escala, spacing, radios, sombras, motion, button/input/link, logo. Salidas: DTCG, DESIGN.md, Tailwind, shadcn. Compara versiones (drift). | Hover/focus leídos del CSS, sin interactuar; dark mode solo con flag. |
| **designlang** (MIT, 4,2k★) | El más completo: regiones semánticas, estados, breakpoints, 17+ salidas (Figma vars, stubs React), puntaje de ADN por 5 ejes contra un corpus. | Sin procedencia por token; `--smart` exige API key. |
| **Firecrawl branding** (SaaS) | 10 roles de color, tipografía, spacing, botones, input, logo, "personality". | Esquema fijo, sin escalas reales. |
| **Context.dev** (ex brand.dev) | h1–h4/p, sombras, botones con el `css` listo, archivos de fuente por peso. | Solo 3 colores; escalas normalizadas e inventadas. |
| **Brandfetch** | Logos por tema y formato, roles de paleta, fuentes. | Sin escala tipográfica, spacing ni componentes. |
| **OpenBrand** (MIT) | Logos, favicon, colores de theme/manifest. | Es un brand kit, no un sistema. |
| **design-md-chrome**, **CSS Peeper**, **Superposition**, **Project Wallace** | Extensiones y analizadores de una página. | Sin roles o sin valores computados. |

Formatos que conviene emitir: **DTCG 2025.10** (con `$extensions` para la procedencia), **DESIGN.md** (Google),
**Tailwind v4 `@theme`**, variables CSS y, más adelante, tema shadcn y variables de Figma.

## Lo que nadie hace bien (hoja de ruta de Matiz)

1. **Procedencia por token**: área en pantalla, elementos y la variable de origen. ✓ La variable ya está.
2. **Cadena de alias**: computado ← semántico ← primitivo (`#d97757` ← `--color-accent` ← `--orange-500`).
3. **Modos reales**: detectar claro/oscuro solo y emparejar roles (modos DTCG/Figma).
4. **Estados medidos interactuando**: hover, focus-visible y active forzados en Playwright, con el delta.
5. **Escala fluida**: `clamp()` medido en 3–4 viewports, ejes variables y font-feature.
6. **Tokens por sección**: la paleta del hero oscuro, del footer… Matiz ya clasifica secciones.
7. **Verificación de la réplica**: renderizar un espécimen con los tokens y compararlo con la captura.
8. **Estilo de iconos e imagen** como parte del ADN.

Fuentes: github.com/dembrandt/dembrandt · github.com/Manavarya09/design-extract · docs.firecrawl.dev ·
docs.context.dev · docs.brandfetch.com · github.com/ethanjyx/OpenBrand · github.com/bergside/design-md-chrome ·
github.com/google-labs-code/design.md · designtokens.org/tr/2025.10
