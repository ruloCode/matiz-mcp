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

## Análisis profundo (`pnpm deep`, `capture --deep`, `capture_site { deep: true }`)

Una segunda pasada con Playwright, con el movimiento ACTIVADO (`reducedMotion: no-preference`), que mide lo
que una captura estática no ve. Código: `src/capture/deep.browser.js` (en la página), `src/capture/deep.ts`
(orquestación) y `src/analysis/deep.ts` (resumen para el agente). Sale `<shots>/<id>/deep.json` y los recortes en `deep/`.

1. **Entrada al hacer scroll.** Antes de bajar se anotan los elementos ocultos bajo el pliegue (opacidad, transform,
   blur, clip-path); se recorre la página de 320 en 320 px y se mide cuáles aparecen y cómo: patrón (sube + fundido,
   zoom, máscara…), distancia, opacidad inicial, duración, curva y escalonado entre hermanos. En el mismo recorrido
   se muestrean `document.getAnimations()`: las animaciones de JS no viven en el CSS.
2. **Componentes reales**, agrupados por firma de estilo: variantes de botón (la primaria es la sólida más arriba y
   más repetida), barra de navegación (alto, vidrio, sticky, enlaces y su separación), tarjetas (padding de los
   cuatro lados, separación interna, sombra, título), pills, input, link y encabezado de sección (antetítulo + título + subtítulo).
3. **Estados medidos interactuando**: a cada componente se le hace hover (al input, focus), se espera su
   transición y se compara el estilo calculado del elemento y de sus hijos (la flecha que se mueve). Recorte antes y después.
4. **Espaciado**: histogramas de padding, gap y márgenes; unidad base (cuántas medidas son múltiplos de 8 o de 4);
   ritmo vertical (el aire real arriba y abajo de cada sección y el ancho de su contenido); contenedor y margen lateral.
5. **Profundidad**: sombras con su tipo (caída, anillo, interior), elevación y en qué elementos se usan; radio por tipo
   de elemento; bordes; efectos (vidrio, texto con degradado, máscaras, blur, grano).
6. **Movimiento**: elementos con transición, propiedades, duraciones, curvas, `@keyframes`, animaciones vivas e
   infinitas, scroll-driven, View Transitions y librerías (GSAP, Framer Motion, Lenis, Lottie…).
7. **Imágenes, rejilla, breakpoints, stack y accesibilidad** (foco visible, prefers-reduced-motion, variante oscura).

En la ficha pública cada número se compara con el catálogo (`metrics` en data.json): tiras con todas las marcas,
percentil y comparación contra otra marca. Los extremos (≥ p90 o ≤ p10) entran en "Lo que la hace única".

Lección: la limpieza de banners hacía clic en `button:has-text('Accept')` y en Stripe encontró "Accept and optimize
payments", abrió un modal y así quedó la captura. Ahora el texto debe ser EXACTO (`text-is`), y el análisis profundo
avisa (`legacyClick`) qué capturas viejas se contaminaron para recapturarlas.

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
4. **Estados medidos interactuando**: ✓ hover y focus con su delta y recorte (falta active y focus-visible por teclado).
5. **Escala fluida**: `clamp()` medido en 3–4 viewports, ejes variables y font-feature.
6. **Tokens por sección** (✓ parcial: el ritmo ya trae el fondo y el aire de cada sección): la paleta del hero oscuro, del footer… Matiz ya clasifica secciones.
7. **Verificación de la réplica**: renderizar un espécimen con los tokens y compararlo con la captura.
8. **Estilo de iconos e imagen** como parte del ADN.

Fuentes: github.com/dembrandt/dembrandt · github.com/Manavarya09/design-extract · docs.firecrawl.dev ·
docs.context.dev · docs.brandfetch.com · github.com/ethanjyx/OpenBrand · github.com/bergside/design-md-chrome ·
github.com/google-labs-code/design.md · designtokens.org/tr/2025.10
