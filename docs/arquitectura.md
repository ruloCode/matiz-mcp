# Arquitectura

## Por qué existe

Medí el MCP de Mobbin con su contrato real (ver `research/mobbin-contract.md`, 69 llamadas). Por cada resultado devuelve una imagen, un link que vence en 30 días y el nombre del sitio. No trae colores, tipografía, estructura ni la URL del sitio, así que todo hay que leerlo de la imagen. Para un agente que va a **escribir código**, ese es el cuello de botella: tiene que adivinar los valores mirando un JPEG.

Este MCP invierte eso: **el dato estructurado es lo principal y la imagen lo acompaña**.

| | Mobbin MCP | Matiz |
|---|---|---|
| Resultado | imagen + link | imagen + tokens medidos + secuencia de secciones + motivos |
| Colores / tipografía | no | sí, con rol (fondo, texto, acento…), familia, escala y tracking |
| Composición | no | `get_composition`: frecuencia, posición y orden típico con evidencia |
| Exportar sistema | no | DESIGN.md (spec de Google) y DTCG (W3C) |
| Similares | no | `find_similar` con desglose por dimensión |
| Diversidad | repite el mismo sitio en el top | máximo 2 por sitio |
| Verificación | no | `critique_against_reference` sobre tu localhost |
| Gusto | no | memoria por proyecto que reordena |
| Ampliar corpus | no (catálogo cerrado) | `capture_site` de cualquier URL pública |
| Costo | plan Pro + créditos por búsqueda | local; la captura es lo único que tarda |
| Cobertura hoy | enorme (iOS + web + flujos) | lo que captures; arranca con ~170 sitios web |

Lo que Mobbin hace mejor y aquí todavía no existe: **flujos multipantalla** y **apps iOS**. Ver la hoja de ruta.

## Piezas

```text
src/
  capture/
    extract.browser.js  corre DENTRO de la página. Mide estilos computados de hasta 9k nodos,
                        botones y bloques. JS plano: tsx inyecta helpers que el navegador no tiene.
    capture.ts          Playwright: navega, quita cookies/chats, fuerza el lazy-load, mide,
                        toma screenshots (página, hero, cada sección + miniatura) y guarda raw.json.
  analysis/             TODO puro y testeado
    color.ts            parseo rgb/hex/oklch/oklab/lab/color(), OKLab, ΔE, WCAG, nombres es/en, escala 50–950
    typography.ts       clase de familia, títulos vs texto, base y razón de escala
    sections.ts         clasificador por puntaje con motivos + sinónimos es/en
    dna.ts              RawPage → Dna (paleta con roles, tipografía, forma, layout, botones, secuencia)
    similarity.ts       parecido por dimensión + LCS de secuencias
    composition.ts      agregado de secuencias: presencia, posición mediana, orden, transiciones
    critique.ts         hallazgos medidos con valor tuyo / de la referencia / qué cambiar
    designmd.ts         DESIGN.md (YAML + prosa en el orden del spec) y DTCG
  db.ts                 node:sqlite + FTS5 (sites, sections, design_docs, taste, refs_fts)
  search.ts             FTS5/BM25 + re-ranking estructurado + diversidad
  taste.ts              memoria de gusto y perfil agregado
  server.ts             las 13 tools + el prompt
```

### Decisiones

- **Medir, no adivinar.** El navegador ya calculó cada estilo: se leen `getComputedStyle` y `getBoundingClientRect`. Los colores modernos llegan como `oklch()` o `lab()` (Tailwind v4) y se convierten bien. Un test lo cubre.
- **Roles por contraste, no por cantidad.** El texto principal es el de MÁS contraste con presencia comparable. En Linear, el gris tiene más caracteres que el blanco, pero el blanco es el texto principal.
- **Pricing exige precio Y periodo.** "$1.4T procesados" es una estadística, no un plan. Encontrado en Stripe.
- **Clasificador con motivos visibles.** Si se equivoca, el agente (y tú) ven por qué. La confianza va en cada sección.
- **`raw.json` por sitio.** Mejorar el análisis no obliga a re-navegar 170 sitios: `pnpm reanalyze` recalcula en segundos.
- **Sin dependencias nativas.** `node:sqlite` trae FTS5. Las miniaturas se reescalan con un canvas en una pestaña en blanco del mismo Chromium, no con sharp.
- **Corpus fuera del repo.** Los screenshots de sitios de terceros son referencia local. El repo solo lleva la lista de URLs.

## Hoja de ruta

1. **Similitud visual.** Embeddings de imagen (SigLIP o UIClip vía transformers.js, local) por sección, para tener `find_similar` por imagen y búsquedas tipo "algo que se vea así" con una captura. UIClip también puntúa calidad: sirve como filtro de gusto.
2. **Alternativas libres de tipografía.** Metadatos de `google/fonts` (OFL/Apache) para proponer el equivalente libre de cada familia comercial (Söhne → Inter/Geist; GT Super → Fraunces…) por clase y métricas.
3. **Flujos.** Capturar recorridos públicos (signup, pricing → checkout) con Playwright scripteado y guardar la secuencia de pantallas. Se puede reutilizar el vocabulario de acciones de `research/taxonomy.json`.
4. **Móvil.** Viewport de 390 px por sitio (responsive real) y, más adelante, apps.
5. **Motion DNA.** Duraciones, easing y librerías (ya se detectan gsap, lenis, framer y lottie) más filmstrip de scroll.
6. **Branding.** Logo (SVG del header), favicon, og:image y voz (titulares) por sitio, para buscar identidades y no solo pantallas.
7. **Crítica con LLM opcional.** Hoy la crítica es 100% medición. Se puede sumar una lectura cualitativa con las imágenes lado a lado, anclada en las cifras.
8. **Servir por HTTP.** `StreamableHTTPServerTransport` para usarlo desde claude.ai o el móvil (Hermes ya tiene túnel).
