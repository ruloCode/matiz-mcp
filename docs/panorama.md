# Panorama: MCP y fuentes de referencias de diseño (2026-10-08)

Las estrellas y las fechas las saqué de la API de GitHub ese día. Sirve para saber qué copiar, qué evitar y dónde está el hueco.

## Top 10 por utilidad para este proyecto

| # | Proyecto | ★ | Qué tomar |
|---|---|---|---|
| 1 | **Refero MCP** (servicio pago) + `referodesign/refero_skill` | 296 | El mejor contrato del mercado: estilos → pantallas → flujos, `get_similar_screens` e imagen bajo demanda. |
| 2 | [INSANE0777/Awwwards-mcp](https://github.com/INSANE0777/Awwwards-mcp) | 99 | La arquitectura open source más rica: FTS5/BM25 local, design DNA, mapa de bandas, motion DNA, captura en vivo y vigilancia de novedades. ⚠️ Scrapea Awwwards. |
| 3 | [dembrandt/dembrandt](https://github.com/dembrandt/dembrandt) | 3.6K | Extractor de tokens con Playwright y salida DTCG/DESIGN.md. Trae MCP. |
| 4 | [veryCoolTimo/design-playbooks-skill](https://github.com/veryCoolTimo/design-playbooks-skill) | 2 | El único que trata la composición como dato: playbooks por tipo de página con frecuencias de patrones. |
| 5 | [google-labs-code/design.md](https://github.com/google-labs-code/design.md) + [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | 28K / 120K | El formato estándar y unos 200 DESIGN.md con licencia MIT. |
| 6 | UIClip (HF `biglab`, UIST'24) | — | CLIP afinado que puntúa calidad de UI y relevancia texto↔UI. La licencia está por verificar. |
| 7 | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 134K | Taxonomía producto → estilo → paleta → tipografía, en CSV. |
| 8 | [codeswithroh/tastemaker](https://github.com/codeswithroh/tastemaker) | 441 | Memoria de gusto por proyecto, paletas desde píxeles y anti-slop. |
| 9 | Mobbin MCP oficial / Lazyweb | 54 / — | Benchmarks de cobertura y precio. |
| 10 | Brandfetch MCP · [OpenBrand](https://github.com/tight-studio/OpenBrand) · Firecrawl `branding` | 9 / 800 / 190K | Assets de marcas reales a partir de una URL. |

Complementan, pero no compiten:

- **Figma MCP** (oficial y [Framelink](https://github.com/GLips/Figma-Context-MCP), 16K) y **Stitch** (8K): son el destino del diseño, no el corpus.
- **21st.dev Magic** (6K): componentes React.
- **Skills de principios:** `anthropics/skills` (frontend-design), `pbakaus/impeccable` y `Leonxlnx/taste-skill`.

## Riesgo de términos de uso (evitar)

- `pdcolandrea/mobbin-mcp` (archivado) y sus forks: usan los endpoints internos de Mobbin con tu cookie de sesión.
- `Arnonfr/behance-mcp-server` y los scrapers de lapa.ninja.
- Awwwards-mcp: rastrea Awwwards y enlaza a su CDN.

## Datasets abiertos

| Dataset | Licencia | ¿Comercial? |
|---|---|---|
| Rico / RICO-SCA (72K pantallas Android, 2017) | CC BY 4.0 | Sí, pero la estética es vieja |
| `google-research-datasets/rico_semantics` | CC BY-SA 4.0 | Sí, con share-alike |
| **UICrit**: críticas de diseño hechas por humanos, con cajas | CC BY 4.0 | Sí; útil para el "por qué" de `critique` |
| Enrico (1.460 pantallas curadas) | MIT | Sí |
| WebUI (CMU, 400K páginas) | Solo investigación | **No** |
| WebSight (2M sintéticos) | CC BY 4.0 | Sí, pero sintético |
| Mind2Web | CC BY 4.0 | Sí; poco valor estético |
| `google/fonts` (metadatos) | OFL / Apache | Sí |
| `meodai/color-names` | MIT | Sí |
| COLOURlovers | CC BY-NC-SA | **No** |

## Huecos que nadie cubre (y este repo ataca)

1. Pantallas, marca y composición en un solo MCP con licencia limpia.
2. **La composición como dato consultable** → `get_composition`.
3. Inspiración de identidades de marca: está en la hoja de ruta.
4. **Pares tipográficos con evidencia de uso** → `suggest_type_pairings`.
5. Similitud visual sobre corpus propio: `find_similar` ya existe por ADN, y la versión por imagen está en la hoja de ruta.
6. **Verificar el build contra la referencia** → `critique_against_reference`.
7. **Memoria de gusto como MCP** → `remember_taste` / `get_taste`.
8. Motion y microinteracciones: hoy solo se detecta la librería.
9. Referencias en español y de LatAm → la semilla incluye Nubank, Mercado Pago, Bold, Clara, Belvo, Kushki y Platzi.
