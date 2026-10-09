// Llama UNA tool de Matiz por MCP real (stdio) y muestra la respuesta; las imágenes se guardan
// en --out (por defecto ./.ask) para verlas. pnpm ask search_references '{"query":"hero oscuro"}'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [tool, json = "{}"] = process.argv.slice(2).filter((a) => !a.startsWith("--out"));
const outArg = process.argv.find((a) => a.startsWith("--out="));
const out = outArg ? outArg.slice(6) : ".ask";
const c = new Client({ name: "ask", version: "0" });
await c.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "src/cli.ts"], stderr: "ignore" }));
const r = (await c.callTool({ name: tool, arguments: JSON.parse(json) }, undefined, { timeout: 300000 })) as {
  content: Array<{ type: string; text?: string; data?: string }>;
  isError?: boolean;
};
mkdirSync(out, { recursive: true });
let n = 0;
let label = "";
for (const part of r.content) {
  if (part.type === "text") {
    if (part.text!.startsWith("↓ ")) label = part.text!.slice(2).split(" ")[0].replace(/[^a-z0-9.#@-]/gi, "_");
    else console.log(part.text);
  } else if (part.type === "image") {
    const f = join(out, `${tool}-${++n}-${label || "img"}.jpg`);
    writeFileSync(f, Buffer.from(part.data!, "base64"));
    console.log(`[imagen] ${f}`);
  }
}
await c.close();
process.exit(r.isError ? 1 : 0);
