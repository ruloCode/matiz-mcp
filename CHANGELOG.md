# Cambios

## 0.3.0 — 2026-11-10

El Estudio deja de ser solo un lienzo: ahora ayuda a que la interfaz no salga genérica y se puede usar dentro del chat.

- **Señales de plantilla.** `check_screen` cuenta en la página renderizada 16 tratamientos que los modelos ponen por defecto (degradados de adorno y su tono, etiquetas en mayúsculas sobre los títulos, una palabra del titular en otro color, contenido en tarjetas idénticas, un solo radio y una sola sombra, emoji de ícono, flechas al final de los botones, 01/02/03 sin secuencia, metadatos con «·», vidrio, líneas de más de 85 caracteres, tamaños de letra sin escala, todo centrado, animación en cada bloque, fuente por defecto) y dice dónde. En una landing genérica de prueba encontró 13; en una hecha con decisiones, 2. `create_board` devuelve la misma lista ANTES de diseñar.
- **Responsive y textos encimados.** `check_screen` vuelve a medir el mismo HTML a 390 px. La sonda detecta textos que se pisan (los desbordes no los ven) y mide el desborde contra el ancho pedido: con emulación móvil Chromium agrandaba el viewport y lo escondía.
- **`draft_wireframe`**: la estructura en bloques grises desde la composición medida del corpus.
- **`pin_reference`**: referencias del corpus en el lienzo, como moodboard, con su nota.
- **Flujos y prototipo**: `data-go="Otra pantalla"` dibuja la flecha en el lienzo, navega en la vista en vivo y entre los HTML exportados.
- **Vista en el chat (MCP Apps)**: las tools del Estudio declaran `ui://matiz/studio.html`; en Claude web y Desktop se ven como tarjeta con la captura, los hallazgos y los botones *Medir* y *Abrir el lienzo*. Sin dependencias nuevas: la vista habla el protocolo directo.
- **Temas más legibles**: el texto secundario medido se deriva si no se distingue del principal o no pasa AA sobre la superficie.
- `check_screen` funciona aunque la pantalla no tenga bloques de texto (antes se rendía).
- Correcciones: la crítica decía "escala de referencia: —px" y "Sombras: subtle vs none" con los dos valores en "none".
- Sitio: sección del Estudio con capturas de un tablero real hecho con las tools (`scripts/studio-demo.ts`).

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
