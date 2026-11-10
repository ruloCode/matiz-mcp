# Cambios

## 0.2.0 — 2026-11-09

El **Estudio**: diseñar pantallas antes de tocar el código.

- 9 tools nuevas: `create_board`, `put_screen`, `get_screen`, `check_screen`, `get_board`, `open_board`, `manage_screen`, `resolve_comment` y `export_board`, más el prompt `design_in_studio`.
- Diseña el modelo del usuario (HTML + Tailwind v4 con los tokens del tablero); Matiz pone el lienzo, el render en Chromium, la medición y la memoria. No llama a ningún modelo ni pide API key.
- Tablero con el sistema de una marca medida del corpus. Si un rol medido no se lee (texto secundario igual al fondo, borde que grita) o falta, se deriva uno legible y queda anotado.
- `put_screen` devuelve la miniatura y los problemas medidos: desborde horizontal con el elemento culpable, contraste texto por texto contra su fondo real, imágenes rotas, fuentes que no cargaron y objetivos táctiles chicos.
- `check_screen` mide la pantalla con el mismo extractor del corpus: colores fuera del sistema, tipografía y radio fuera del tablero y la crítica contra la referencia.
- Lienzo local (`/studio`, o `npx -y matiz-mcp studio`): zoom, capas, variantes, versiones, vista en vivo interactiva, aprobar/descartar y comentarios que señalan el elemento exacto.
- Tailwind v4 para navegador va dentro del paquete: funciona sin internet (salvo las fuentes).

## 0.1.0 — 2026-10-09

Primera versión pública.

- 16 tools por MCP: búsqueda de referencias, ADN de marca (`get_brand_kit`), blueprint de secciones, composición, pares tipográficos, paletas, DESIGN.md, crítica contra tu `localhost`, memoria de gusto y captura de sitios nuevos.
- Corpus empaquetado: 954 registros de 163 marcas (158 portadas, 644 páginas internas y 152 versiones móviles), con el análisis profundo de 157 de ellas: componentes con su hover medido en vivo, ritmo de espaciado, sombras, movimiento y entradas al hacer scroll.
- Galería local (`matiz-mcp gallery`) y catálogo público en https://matiz-mcp.vercel.app/explorar/.
- Sin cuenta ni API key. Requiere Node.js 22.13 o superior; Chromium se instala solo la primera vez que hace falta.
