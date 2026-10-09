// Chromium bajo demanda: la primera captura en una máquina nueva lo instala sola.
// La salida va a stderr — stdout es el canal del protocolo MCP y no se toca.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export function isMissingBrowser(e: unknown): boolean {
  return /Executable doesn't exist|browserType\.launch.*(not found|doesn't exist)|Please run the following command to download/i.test(
    String((e as Error)?.message ?? e),
  );
}

export function installChromium(): { ok: boolean; output: string } {
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve("playwright/package.json")), "cli.js");
  process.stderr.write("[matiz] Instalando Chromium para capturar sitios (solo la primera vez, ~1 min)…\n");
  const r = spawnSync(process.execPath, [cli, "install", "--only-shell", "chromium"], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  process.stderr.write(output.split("\n").filter((l) => !/■/.test(l)).join("\n") + "\n");
  return { ok: r.status === 0, output };
}
