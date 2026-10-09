# Matiz

> El tono y el matiz: referencias de diseño medidas, no solo imágenes.

Matiz es un servidor MCP de **referencias de diseño como datos**. Mobbin y similares le dan al agente una imagen y un link. Matiz le da, además de la imagen, lo que necesita para construir:

- tokens medidos: colores con rol, tipografía real, radios, espaciado y botones,
- la estructura de la página, con cada sección clasificada y el motivo de esa clasificación,
- un DESIGN.md con el formato estándar.

Además responde preguntas que ninguna galería responde:

- *¿Qué secciones lleva un landing de devtools y en qué orden?* Lo saca de N sitios reales.
- *¿Qué par tipográfico usan los sitios oscuros?* Lo saca del uso real, no de una lista curada.
- *¿Mi build se parece a la referencia? ¿Qué le falta?* Lo mide sobre tu `localhost`.
- *¿Qué me gustó en este proyecto?* Guarda una memoria de gusto que reordena las búsquedas.

El corpus se arma con **sitios públicos que capturas tú** (Playwright) y con **DESIGN.md de repos con licencia MIT**. No copia catálogos de servicios pagos.

## Instalar

Requisitos: **Node.js 22.13 o superior**. No hace falta cuenta ni API key.

| Cliente | Cómo |
|---|---|
| Claude Code | `claude mcp add matiz --scope user -- npx -y matiz-mcp` |
| Codex | `codex mcp add matiz -- npx -y matiz-mcp` (en `~/.codex/config.toml` sube `startup_timeout_sec = 60`) |
| VS Code (Copilot) | `code --add-mcp '{"name":"matiz","command":"npx","args":["-y","matiz-mcp"]}'` |
| Claude Desktop, Cursor, Gemini CLI, Windsurf | `{"mcpServers":{"matiz":{"command":"npx","args":["-y","matiz-mcp"]}}}` en su archivo de configuración |
| Zed | `{"context_servers":{"matiz":{"command":"npx","args":["-y","matiz-mcp"]}}}` en `settings.json` |

Las rutas exactas de cada archivo de configuración están en [matiz-mcp.vercel.app](https://matiz-mcp.vercel.app/#instalar). El catálogo completo, con el ADN de cada marca, se puede recorrer en [matiz-mcp.vercel.app/explorar](https://matiz-mcp.vercel.app/explorar/).

**Qué pasa la primera vez:**
- El servidor importa el corpus empaquetado (DNA de las marcas, sin imágenes) en `~/.matiz`, en menos de un segundo.
- La primera imagen que pidas instala Chromium solo (~100 MB, una vez) y captura ese sitio.
- La primera búsqueda en DESIGN.md los indexa (~5 s, necesita `git`).

### Galería

`npx -y matiz-mcp gallery` abre `http://localhost:4040` con el corpus de tu máquina:
- "Destacadas" ordena por tipo de sección, calidad y marcas curadas, una marca por vuelta.
- Filtros por sección, página, industria, tema y escritorio/móvil.
- Ficha con paleta por rol, tipografía y alternativa libre, motivos, la página completa y similares.
- Botones para copiar el blueprint o el DESIGN.md.
- Escucha solo en `127.0.0.1`: las capturas no salen de tu máquina.

### CLI

```bash
npx -y matiz-mcp            # servidor MCP (stdio)
npx -y matiz-mcp init       # prepara todo de una vez (corpus, Chromium, DESIGN.md)
npx -y matiz-mcp init --images   # además baja las capturas de todo el corpus (~15 min)
npx -y matiz-mcp doctor     # diagnóstico
npx -y matiz-mcp capture https://ejemplo.com
npx -y matiz-mcp capture https://ejemplo.com --deep   # + componentes con hover real, ritmo y movimiento
npx -y matiz-mcp seed --pages --mobile   # páginas internas y versión móvil
```

### Desarrollo

```bash
pnpm install && pnpm test
pnpm smoke                 # las 16 tools por MCP real
pnpm eval                  # exactitud del clasificador contra research/eval
pnpm ask <tool> '<json>'   # llama una tool y guarda sus imágenes en .ask/
pnpm export-pack           # empaqueta el corpus actual para distribuir
pnpm build:site            # regenera la landing con las cifras reales del corpus
```

## Tools

| Tool | Para qué |
|---|---|
| `search_references` | Busca sitios o secciones (hero, pricing, faq…) en español o inglés. Trae tokens, secuencia y miniatura. Filtra por tema, industria y gusto del proyecto, con máximo 2 resultados por sitio. |
| `get_reference` | Todo lo medido de un sitio o sección: paleta con roles, niveles tipográficos, escalas y el porqué de cada sección. |
| `get_brand_kit` | Todo para replicar una marca: variables CSS que el sitio declara (con su nombre), roles de color con contraste y su variable de origen, escala tipográfica real, fuentes con alternativa libre, logo, botones, tarjeta, input, link, movimiento y qué la hace única frente al corpus. Con el análisis profundo suma cada variante de botón, tarjeta, pill e input con su CSS y su **hover medido en vivo**, la jerarquía h1–h4, la unidad base y el ritmo de secciones, las sombras, las curvas y lo que entra al hacer scroll. Exporta a CSS, Tailwind v4, DTCG o DESIGN.md. Ver [docs/brand-dna.md](docs/brand-dna.md). |
| `get_section_blueprint` | El esqueleto de una sección (rejilla, columnas, gaps, padding, jerarquía tipográfica, bloques repetidos) + un componente React/Tailwind con las medidas reales. Texto de relleno: toma la estructura, no el copy. |
| `open_gallery` | Abre la galería local (estilo Mobbin) en el navegador. |
| `get_design_md` | Exporta el sistema visual como DESIGN.md (spec de `google-labs-code/design.md`) o tokens W3C DTCG. |
| `find_similar` | Vecinos por ADN de diseño, con el desglose de en qué se parecen. |
| `get_composition` | Qué secciones aparecen, su frecuencia, su posición típica, el orden típico, las transiciones y las aperturas. |
| `suggest_type_pairings` | Pares de títulos y texto que se usan de verdad, con tamaños, tracking y los sitios que los usan. |
| `suggest_palettes` | Paletas reales con roles y la escala 50–950 del acento. |
| `search_design_md` | Busca en los DESIGN.md abiertos indexados. |
| `capture_site` | Agrega cualquier sitio público al corpus (~10 s). Con `deep: true` hace además el análisis profundo (~20 s más). |
| `critique_against_reference` | Mide tu página, incluso en localhost, contra una referencia: contraste WCAG, paleta, tipografía, forma, layout y secciones faltantes. |
| `remember_taste` / `get_taste` | Memoria de gusto por proyecto: like, dislike y reglas propias. |
| `corpus_stats` | Qué hay en el corpus. |

También trae un prompt, `design_from_references`, que guía al agente por el flujo completo: composición → referencias → identidad → DESIGN.md → construir → criticar.

## Cómo funciona

```text
URL pública ──Playwright──► extract.browser.js ──► RawPage ──► buildDna() ──► SQLite (FTS5)
                 (mide estilos computados,          │            │                │
                  parte la página en secciones)     │            ├─ paleta + roles (OKLab)
                                                     │            ├─ tipografía + escala
                                                     │            ├─ secciones clasificadas
                                                     │            └─ secuencia / botones / motion
                                                     └─► raw.json (pnpm reanalyze recalcula sin navegar)
```

- **Nada se inventa.** Todo valor sale de `getComputedStyle` del sitio en vivo. Los colores se agrupan en OKLab, y el contraste se mide con la fórmula de WCAG.
- **Clasificación explicable.** Cada sección lleva `reasons` (p. ej. "3 precios con periodo", "titular de 64px en el primer pantallazo").
- **Local.** El corpus vive en `~/.matiz` (`MATIZ_HOME`), nunca en el repo.
- **Cero dependencias nativas.** Usa `node:sqlite` con FTS5, que viene en Node ≥ 22.5.

Más detalle en [docs/arquitectura.md](docs/arquitectura.md). El estudio de qué hay en el ecosistema está en [docs/panorama.md](docs/panorama.md), y la ingeniería inversa del contrato de Mobbin en [research/](research/).

## Scripts

| Script | Qué hace |
|---|---|
| `pnpm capture <url…> [--tags a,b] [--industry x] [--dry]` | Captura sitios sueltos (`--dry` solo mide). |
| `pnpm seed [--only fintech] [--limit 20] [--force]` | Siembra desde `data/seed-sites.json`. |
| `pnpm reanalyze` | Recalcula el DNA de todo el corpus con el análisis actual. |
| `pnpm test` | Contratos de comportamiento con páginas sintéticas, sin datos de terceros. |

## Legal y ética

- Captura solo páginas públicas, a ritmo humano y con un navegador normal.
- Los screenshots son material de referencia **local**: no se redistribuyen y el repo no los incluye.
- Las respuestas citan siempre la URL original.
- Los DESIGN.md indexados vienen de repos con licencia MIT y se cita la fuente de cada uno.
- Mobbin se estudió solo a través de su MCP oficial, para entender su contrato. Ver [research/mobbin-contract.md](research/mobbin-contract.md).
- El corpus empaquetado trae medidas (tokens, estructura, textos cortos de títulos y botones), nunca capturas. ¿Es tu sitio y quieres que lo retiremos? Escríbenos en [github.com/ruloCode](https://github.com/ruloCode) y lo quitamos en la siguiente versión.

Licencia MIT.
