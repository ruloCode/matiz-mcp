# Contrato público del MCP de Mobbin (mapeado 2026-10-08)

Mapeo empírico de las tres tools del MCP de Mobbin (`search_screens`, `search_flows`, `search_sections`) hecho con la cuenta de pago de Rulo, para diseñar un MCP de referencias de diseño propio a partir de fuentes públicas. Aquí no se guardan imágenes, `image_url`, ids ni `mobbin_url` reales: solo el contrato, la forma de las respuestas y lo observado.

- **Llamadas usadas:** 69 en total. 56 respondieron con resultados, 9 fueron rechazos de validación (no llegan al motor) y 4 fallaron en runtime por ráfaga (ver Errores).
- **Parámetros fijos en todas las llamadas:** `image_format: "jpg"`, `output_destination: "doc"`, `task_intent: "Map the design reference taxonomy and API contract to design an independent design reference MCP."`.

---

## 1. Las tres tools de un vistazo

| | `search_screens` | `search_flows` | `search_sections` |
|---|---|---|---|
| Qué devuelve | Pantallas sueltas de apps (iOS) o productos web | Recorridos de varios pasos, con todas sus pantallas en orden | Recortes de secciones de sitios de marketing (hero, pricing, footer…) |
| `platform` | **requerido**, `ios` \| `web` | **requerido**, `ios` \| `web` | **no existe**: solo web |
| `limit` | default 20, mín. 1, máx. **30** | default 5, mín. 1, máx. **10** | default 20, mín. 1, máx. **30** |
| Paginación | **No hay `page`.** La única forma de pedir "más" es `exclude_screen_ids` | `page` default 1, máx. **20** | `page` default 1, sin tope práctico (máx. = `Number.MAX_SAFE_INTEGER`) |
| `has_next_page` | no viene | sí | sí |
| `mode` | `deep` (default) \| `standard` \| `fast` (alias deprecado de standard) | no existe | no existe |
| Nombre de la entidad | `app_name` + `platform` | `app_name` + `platform` | `site_name` (sin plataforma) |

## 2. Parámetros (entrada)

Todos los esquemas son JSON Schema draft-07 y se validan con **Zod v4** del lado del servidor (los errores lo delatan: `origin`, `code`, `too_big`, `invalid_value`).

### Comunes a las tres

| Parámetro | Tipo | Default | Restricciones | Notas |
|---|---|---|---|---|
| `query` | string | — (requerido) | 1..500 chars | Lenguaje natural. El schema pide describir UNA pantalla/flujo/sección, sin negaciones, sin "modern/clean", sin listas sueltas de keywords, sin decir la plataforma. Nombrar una app la filtra ("Duolingo onboarding"). |
| `image_format` | enum | `webp` | `webp` \| `jpg` | `png` → error de validación. |
| `limit` | integer | ver tabla | ver tabla | El texto del schema advierte que más resultados = más contexto (cada resultado trae imagen inline). |
| `output_destination` | enum | — (opcional en el schema) | `code` \| `design_tool` \| `doc` \| `reference_library` \| `chat` \| `other` | Telemetría de intención: "MUST be the same across all calls for the same task". No vimos que cambiara la respuesta. |
| `output_tool` | string | — | nombre de producto | "Figma", "Notion"… Telemetría. |
| `task_intent` | string | — | una frase en inglés | Telemetría + "helps return more relevant results". Debe ser idéntica en toda la tarea y sin datos personales. |

### Solo `search_screens`

| Parámetro | Tipo | Default | Restricciones |
|---|---|---|---|
| `platform` | enum | — (requerido) | `ios` \| `web` |
| `mode` | enum | `deep` | `deep` \| `standard` \| `fast` (deprecado = `standard`) |
| `exclude_screen_ids` | string[] (uuid) | `[]` | máx. 100 items; cada uno debe pasar el regex de UUID v1-8 (o el nil/max UUID) |

### Solo `search_flows`

| Parámetro | Tipo | Default | Restricciones |
|---|---|---|---|
| `platform` | enum | — (requerido) | `ios` \| `web` |
| `page` | integer | 1 | 1..20 |

### Solo `search_sections`

| Parámetro | Tipo | Default | Restricciones |
|---|---|---|---|
| `page` | integer | 1 | ≥1 (sin máximo útil) |

## 3. Respuesta (salida)

Cada llamada devuelve **dos cosas**: (a) bloques de imagen inline (previews de baja resolución para que el modelo "vea") y (b) un bloque de texto JSON con la metadata. El cliente las guarda en su caché de tool-results; nosotros no las conservamos.

### `search_screens`

```json
{
  "query": "<eco de la query>",
  "screens": [
    {
      "id": "<uuid de la pantalla>",
      "image_url": "https://mobbin.com/api/mcp/short/<token 8 chars>",
      "mobbin_url": "https://mobbin.com/screens/<uuid>",
      "app_name": "Linear",
      "platform": "web"
    }
  ]
}
```

| Campo | Descripción |
|---|---|
| `query` | Eco literal de la query enviada. |
| `screens[]` | Lista ordenada por relevancia. **No** trae `page` ni `has_next_page`. |
| `id` | UUID estable de la pantalla. Es lo que acepta `exclude_screen_ids`. |
| `image_url` | Enlace corto firmado a la imagen en alta resolución. **Se regenera en cada llamada** (la misma pantalla devolvió dos tokens distintos en dos llamadas) y, según la descripción de la tool, caduca a los 30 días. |
| `mobbin_url` | Enlace canónico a la ficha en Mobbin (`/screens/<id>`). Es el que la tool pide citar ante el usuario. |
| `app_name` | Nombre de la app/producto. Es el único dato "semántico" por pantalla. |
| `platform` | `ios` \| `web` (eco del filtro). |

### `search_flows`

```json
{
  "query": "...",
  "page": 1,
  "has_next_page": true,
  "flows": [
    {
      "id": "<uuid del flujo>",
      "name": "Onboarding",
      "actions": ["Creating Account", "Onboarding", "Verifying"],
      "mobbin_url": "https://mobbin.com/flows/<uuid>",
      "app_name": "Jira",
      "platform": "web",
      "screen_count": 10,
      "screens": [
        { "screen_id": "<uuid>", "image_url": "https://mobbin.com/api/mcp/short/<token>", "position": 1 }
      ]
    }
  ]
}
```

| Campo | Descripción |
|---|---|
| `page`, `has_next_page` | Paginación. En `page: 20` con `limit: 1` llegó `has_next_page: false`: el techo de 20 páginas es duro, así que con `limit` 1 solo se alcanzan 20 flujos por query (con `limit` 10, 200). |
| `name` | Nombre humano del flujo, en gerundio o sustantivo: "Onboarding", "Customizing an experience", "Setting up workspace", "Creating a workspace", "Placing an order", "Purchasing a product", "Upgrading a plan", "Select a plan", "Chat", "Chatting with Grok". |
| `actions[]` | **Taxonomía controlada de acciones** (verbos de UX). Puede venir vacía `[]`. Ver §6. |
| `screen_count` | Número total de pantallas del flujo (vimos de 2 a 41). |
| `screens[]` | **Todas** las pantallas del flujo en orden: `screen_id`, `image_url` (corto) y `position` (base 1). No traen etiqueta, texto ni tipo de pantalla por paso. |

**Previews inline de un flujo:** no son todas las pantallas sino un muestreo espaciado que crece con la longitud: 2 pantallas → 2, 6-7 → 3, 10 → 4, ≥13 → 5 (tope observado 5 por flujo, también en uno de 41). Con `limit: 3` una respuesta trae hasta ~15 imágenes.

### `search_sections`

```json
{
  "query": "...",
  "page": 1,
  "has_next_page": true,
  "sections": [
    {
      "id": "<uuid>",
      "image_url": "https://mobbin.com/api/mcp/short/<token>",
      "mobbin_url": "https://mobbin.com/sites/sections/<uuid>",
      "site_name": "Stripe"
    }
  ]
}
```

Igual que screens pero con `site_name` en lugar de `app_name`/`platform`, y con paginación.

### Campos que NO aparecieron nunca

- `ai_usage_notice`: la descripción de `search_screens` dice que si viene hay que mostrarlo textual, pero **no vino en ninguna de las 56 respuestas** (ni en screens ni en las otras dos). Tu MCP puede prever un campo equivalente opcional (aviso legal/licencia) que el cliente muestre tal cual.
- Ningún score de relevancia, total de resultados, tags de componentes, colores, tipografías, categoría de la app, fecha de captura, versión de la app ni texto OCR.

## 4. Las imágenes (lo que se ve, no lo que se guarda)

- **Marca de agua estructural:** cada imagen inline lleva abajo una franja oscura de ~48 px con el ícono y el nombre de la app a la izquierda y "curated by Mobbin" a la derecha. Es la firma de procedencia: tu MCP debería hacer lo mismo con su fuente (atribución a la vista).
- **Tamaños de las previews:** web = 768 px de ancho (≈768×521 en screens y flows web); iOS = ≈299×678 (marco de iPhone con status bar 9:41). Sections = 768 px de ancho y **alto variable**: el recorte respeta la altura real de la sección (una franja de logos mide ~130 px, un stats strip ~155 px) y las secciones largas salen de dos formas: recortadas a la altura de un viewport (~470 px útiles) o, a veces, la sección completa escalada (un grid de equipo salió de 303×660).
- **Las sections son capturas de scroll:** muchas traen el navbar sticky encima de la sección (y a veces el borde de la sección anterior o siguiente). No son recortes limpios de un componente aislado.
- **Datos sembrados:** las capturas usan cuentas de prueba de Mobbin (emails tipo `samlee.mobbin@…`, nombres "Sam Lee", "Alex Smith", workspace "AS Mobbin"/"SLMobbin"). Es contenido real capturado por humanos, no generado.
- **Estados múltiples de la misma pantalla:** la base guarda varios estados del mismo screen (Oku pricing mensual vs anual; login de Height vacío vs con contraseña). Por eso salen casi-duplicados en un mismo resultado.

## 5. Modos de `search_screens`: `deep` vs `standard`

Prueba con la misma query ("paywall with free trial timeline and annual plan highlighted", iOS, `limit` 4), cronometrada de punta a punta desde el cliente:

| | `deep` (default) | `standard` |
|---|---|---|
| Latencia | **≈13 s** | **≈5,5 s** |
| Resultados | Deepstash, Deezer, The Atlantic Magazine, 5 Minute Journal | Copilot, Jomo, Givingli, Lifesum |
| Calidad | Los 4 son paywalls con plan anual o trial; 2 de 4 tienen la línea de tiempo del trial. Interpreta la intención. | 3 de 4 tienen la línea de tiempo del trial, pero uno (Jomo) no muestra plan anual y otro (Lifesum) es un paywall sin línea de tiempo. Más "por keywords". |

Para el login web los dos modos devolvieron conjuntos **disjuntos** (deep: Height, Relume, Sprig · standard: Descript, Customer.io, komoot). Conclusión: deep = recuperación amplia + re-ranking por LLM que "puntúa cada candidato y se queda con los fuertes" (dice el schema); standard = recuperación vectorial directa. Deep **no es determinista**: la misma query repetida (con un id excluido) cambió un tercer resultado (salió Sprig, entró Coursera).

## 6. Taxonomía de `actions` (flows) observada

Vocabulario cerrado con forma "Verbo-ando & Verbo-ando" (Title Case, en inglés):

- `Onboarding`
- `Creating Account`
- `Verifying`
- `Setting Up`
- `Adding & Creating`
- `Selecting & Choosing`
- `Inviting Teammates & Friends`
- `Subscribing & Upgrading`
- `Purchasing & Ordering`
- `Chatting & Sending Messages`
- `Reviewing & Rating`
- `Starting & Completing`
- `[]` (flujos sin acción etiquetada: "Chat" de v0 y de Meta AI, "Select a plan" de Uvodo)

Un flujo lleva de 0 a 4 acciones. Es la pieza de taxonomía más valiosa que expone el contrato: conviene replicar la idea (un vocabulario de verbos de UX por recorrido, multi-etiqueta).

## 7. Comportamientos y quirks

1. **Filtro por app en la query:** "Duolingo onboarding" devolvió solo flujos de Duolingo (dos flujos de 20 pantallas, uno etiquetado `Onboarding` y otro `Selecting & Choosing`). "Linear issue list grouped by status" devolvió 3 pantallas de Linear. El nombre de la app funciona como filtro duro, no como un término más.
2. **`exclude_screen_ids` excluye la pantalla, no la app:** al excluir el login de Height volvió **otra** pantalla de Height (el mismo login con la contraseña escrita). Para diversificar por app hay que excluir todos sus ids o filtrar del lado del cliente.
3. **Duplicados por sitio en sections:** Oku salió dos veces en el mismo top 3 (pricing mensual y anual), Framer dos veces en templates. No hay diversificación por `site_name`.
4. **Negaciones:** "settings page without a sidebar" (deep) devolvió de verdad pantallas de settings en una sola columna centrada (Square, GetYourGuide, GoFundMe). Deep las tolera aunque el schema pida evitarlas; en standard no se probó.
5. **Query vaga de estilo:** "modern clean minimal beautiful" en sections devolvió heros genéricos y muy distintos entre sí (Headspace ilustrado, Shuttle centrado mínimo, Studio Freight editorial con serif). No falla: degrada a "cualquier sección bonita", que en la práctica es un hero.
6. **Español:** "pantalla de carrito de compras con resumen del pedido y botón de pagar" (iOS, deep) devolvió carritos pertinentes (Target, HBX, Ulta Beauty). El embedding/LLM es multilingüe.
7. **Las sections NO son componentes aislados:** pedir "navbar/header" devuelve heros y hasta un footer completo (Wellfound) que *contienen* un navbar. El navbar no parece ser un tipo indexado por sí solo.
8. **Los flujos pueden empezar antes del flujo:** varios onboarding web arrancan en la landing (Mistral AI, Jira, WorkOS) y terminan en el dashboard; el recorrido incluye contexto de entrada y salida.
9. **Cada respuesta cuesta contexto, no solo créditos:** las imágenes inline son la mayor parte del peso. Flows con `limit` 3 ≈ 15 imágenes.

## 8. Errores (textos literales)

**Validación (JSON-RPC `-32602`, se rechazan antes de buscar):**

```
MCP error -32602: Input validation error: Invalid arguments for tool search_screens: [
  { "origin": "number", "code": "too_big", "maximum": 30, "inclusive": true, "path": ["limit"],
    "message": "Too big: expected number to be <=30" } ]
```

| Caso | `message` |
|---|---|
| `search_screens` `limit: 31` | `Too big: expected number to be <=30` |
| `search_screens` `limit: 0` | `Too small: expected number to be >=1` |
| `search_sections` `limit: 31` | `Too big: expected number to be <=30` |
| `search_flows` `limit: 11` | `Too big: expected number to be <=10` |
| `search_flows` `page: 21` | `Too big: expected number to be <=20` (path `["page"]`) |
| `query: ""` | `Too small: expected string to have >=1 characters` |
| `platform: "android"` | `Invalid option: expected one of "ios"\|"web"` (code `invalid_value`) |
| `image_format: "png"` | `Invalid option: expected one of "webp"\|"jpg"` |
| `exclude_screen_ids: ["not-a-uuid"]` | `Invalid UUID` (code `invalid_format`, con el regex completo en `pattern`) |

Los errores llegan **todos juntos** en un arreglo (con `platform: android` + `image_format: png` llegaron los dos issues en la misma respuesta).

**Runtime:**

- `Failed to execute search.` — salió en las **4** llamadas de una tanda paralela de 4 `search_sections` lanzada justo después de otra tanda de 4. Las mismas queries, una por una o de a dos, funcionaron. Parece límite de concurrencia/ráfaga (≈8 búsquedas en ~30 s), sin `Retry-After` ni código. El mensaje es genérico: no distingue rate limit de fallo del motor.

## 9. Auth, créditos y telemetría

- La auth es del conector (OAuth de la cuenta de Mobbin en el host); no hay API key en los parámetros.
- Cada búsqueda gasta créditos de IA de la cuenta (lo dice el encargo; la respuesta no trae saldo ni costo). No hay forma de consultar el consumo desde el MCP.
- `output_destination`, `output_tool` y `task_intent` son **telemetría de producto** disfrazada de parámetro de relevancia: las descripciones exigen que sean idénticos en toda la tarea, lo que sirve para agrupar sesiones y saber para qué se usa la herramienta (code vs Figma vs docs). En las pruebas no vimos que cambiaran los resultados.
- El schema de `search_screens` instruye al modelo: citar cada pantalla con su `mobbin_url`, no describir pantallas solo por la metadata ("examine the returned images"), descargar desde `image_url` si el usuario quiere guardar (no reusar la preview) y mostrar `ai_usage_notice` textual. En hosts con MCP Apps además pinta una galería interactiva.

## 10. Lo que NO devuelve (gaps)

Lo que tu MCP puede dar y Mobbin no:

1. **Nada estructurado sobre el diseño:** ni paleta, ni tipografías, ni espaciado, ni radios, ni componentes detectados, ni texto de la pantalla. Todo lo semántico vive en la imagen y el modelo tiene que "mirarla" (cara en tokens).
2. **Sin tipo de sección/pantalla en la respuesta:** no te dice "esto es un pricing con toggle"; solo te da lo que coincidió con tu query. No hay facetas (categoría, industria, estilo, tema claro/oscuro).
3. **Sin URL pública del sitio/app:** `site_name` es solo el nombre ("Stripe"), sin dominio ni página de origen. Tampoco fecha de captura, así que no sabes si el diseño sigue vivo.
4. **Sin paginación en screens** y sin total de resultados en ninguna tool.
5. **Sin score** ni explicación de por qué entró cada resultado (ni en deep, que sí puntúa internamente).
6. **Sin diversidad por fuente:** duplicados del mismo sitio/app en el mismo top.
7. **Sin búsqueda por imagen** ("encuéntrame algo parecido a esta captura") ni por app exacta como parámetro (el filtro por app va mezclado en el texto libre).
8. **Sin Android, sin escritorio nativo, sin email/tablet** en este MCP: `platform` solo acepta `ios` y `web`, y las sections son solo web.
9. **Sin código ni HTML/CSS** de las secciones: son capturas rasterizadas, no DOM.
10. **Flujos sin anotación por paso:** `screens[]` trae posición e imagen, nada de "paso 3 = verificar email".
11. **Enlaces efímeros:** `image_url` caduca a los 30 días y cambia en cada llamada; no sirve como identificador ni como caché.
12. **Sin manejo explícito de rate limit** (mensaje genérico, sin reintento sugerido).

## 11. Ideas para el MCP propio, sacadas del contrato

- Mantener las tres "granularidades" (pantalla / recorrido / sección) porque responden a preguntas distintas, pero devolver **metadata estructurada** (tipo, elementos en orden, paleta dominante, tipografía, tema, URL de origen, fecha de captura) para que el modelo no dependa de leer pixeles.
- Paginación uniforme en las tres tools (`page` + `has_next_page` + total) y `exclude_*` por id **y** por app/sitio.
- Diversificar por fuente en el ranking (máx. N por sitio).
- Dos modos como Mobbin (rápido vectorial / profundo con re-ranking por LLM) pero reportando `score` y `why`.
- Vocabulario controlado de acciones para flujos (§6) más un vocabulario de tipos de sección (`taxonomy.json`).
- Errores con códigos claros (`RATE_LIMITED` con `retry_after`, `NO_RESULTS`, `INVALID_ARGUMENT`) en vez de "Failed to execute search.".
