// Prueba de punta a punta: levanta el servidor por stdio como lo haría un cliente MCP
// y llama cada tool contra el corpus real. pnpm smoke
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "smoke", version: "0" });
await client.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "src/server.ts"], stderr: "ignore" }));

const tools = (await client.listTools()).tools.map((t) => t.name);
console.log(`tools (${tools.length}): ${tools.join(", ")}`);
const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
console.log(`prompts: ${prompts.join(", ")}`);

let failures = 0;
async function call(name: string, args: Record<string, unknown>, show = 600) {
  const t0 = Date.now();
  const r = (await client.callTool({ name, arguments: args })) as { content: Array<{ type: string; text?: string; data?: string }>; isError?: boolean };
  const texts = r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const imgs = r.content.filter((c) => c.type === "image").length;
  if (r.isError) failures++;
  console.log(`\n${r.isError ? "✗" : "✓"} ${name} ${JSON.stringify(args)} · ${Date.now() - t0}ms · ${imgs} imágenes`);
  console.log(texts.slice(0, show));
  return texts;
}

await call("corpus_stats", {}, 900);
await call("search_references", { query: "página de precios con planes en tarjetas", limit: 4 }, 900);
await call("search_references", { query: "dark hero with large serif headline", kind: "section", theme: "dark", limit: 3, images: false }, 600);
await call("get_composition", { industry: "devtools" }, 1200);
await call("suggest_type_pairings", { limit: 5 }, 900);
await call("suggest_palettes", { theme: "dark", limit: 3 }, 700);
await call("find_similar", { ref_id: "linear.app", limit: 4, images: false }, 700);
await call("get_design_md", { ref_id: "stripe.com" }, 1600);
await call("get_reference", { ref_id: "linear.app", image: "thumb" }, 400);
await call("search_design_md", { query: "fintech dark minimal", limit: 2 }, 400);
await call("remember_taste", { project: "smoke", verdict: "like", ref_id: "linear.app", note: "contraste y tipografía" });
await call("remember_taste", { project: "smoke", verdict: "rule", note: "sin gradientes" });
await call("get_taste", { project: "smoke" }, 600);
await call("critique_against_reference", { url: "https://vercel.com", ref_id: "linear.app", images: false }, 1500);
await call("get_section_blueprint", { ref_id: "linear.app#3", format: "outline" }, 500);
await call("get_brand_kit", { ref_id: "stripe.com", format: "summary" }, 700);
await call("get_reference", { ref_id: "no-existe.xyz" }, 200);
await client.close();
console.log(`\n${failures} llamadas con isError (se espera 1: la de no-existe.xyz)`);
