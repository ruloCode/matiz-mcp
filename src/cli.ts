#!/usr/bin/env node
// Punto de entrada del paquete.
//   matiz-mcp                 servidor MCP por stdio (lo que configuras en Claude, Codex, Cursor…)
//   matiz-mcp init [--images] prepara esta máquina: corpus, Chromium y DESIGN.md abiertos
//   matiz-mcp doctor          diagnóstico
//   matiz-mcp capture <url…>  agrega sitios al corpus
//   matiz-mcp seed [--limit N] [--only industria] [--images]
//   matiz-mcp stats

const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  process.stderr.write(`Matiz necesita Node.js 22.13 o superior (tienes ${process.versions.node}). Descárgalo en https://nodejs.org\n`);
  process.exit(1);
}
// node:sqlite avisa "experimental" en cada arranque: ruido para el usuario y para el cliente MCP
const emit = process.emitWarning.bind(process);
process.emitWarning = ((w: string | Error, ...rest: unknown[]) => {
  if (/SQLite is an experimental/i.test(String(w))) return;
  (emit as (...a: unknown[]) => void)(w, ...rest);
}) as typeof process.emitWarning;

const args = process.argv.slice(2);
const cmd = args[0] && !args[0].startsWith("-") ? args[0] : "serve";
const flag = (k: string) => args.includes(`--${k}`);
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const say = (m: string) => process.stdout.write(m + "\n");

async function main() {
  if (cmd === "serve") {
    await import("./server.js");
    return;
  }
  if (cmd === "help" || flag("help")) {
    say(
      [
        "Matiz — referencias de diseño como datos (MCP)",
        "",
        "  npx -y matiz-mcp                 servidor MCP (stdio)",
        "  npx -y matiz-mcp init [--images] prepara la máquina (corpus + Chromium + DESIGN.md)",
        "  npx -y matiz-mcp doctor          diagnóstico",
        "  npx -y matiz-mcp capture <url>   agrega un sitio",
        "  npx -y matiz-mcp seed [--limit N] [--only fintech] [--images]",
        "  npx -y matiz-mcp stats",
        "",
        "Datos en ~/.matiz (cámbialo con MATIZ_HOME).",
      ].join("\n"),
    );
    return;
  }

  const { HOME, allSites, openDb } = await import("./db.js");
  const { importPack, corpusIsEmpty } = await import("./pack.js");
  const { seedDesignDocs, designDocCount } = await import("./design-docs.js");
  const { closeBrowser, ensureBrowser } = await import("./capture/capture.js");

  if (cmd === "init") {
    say(`Matiz · preparando ${HOME}`);
    const r = importPack();
    say(r.imported ? `✓ corpus: ${r.imported} sitios importados` : `✓ corpus: ya tenías ${allSites().length} sitios`);
    say("… Chromium (para capturar y criticar)");
    const b = await ensureBrowser();
    say(b.ok ? `✓ Chromium listo${b.installed ? " (recién instalado)" : ""}` : `✗ Chromium: ${b.error}`);
    say("… DESIGN.md abiertos (MIT)");
    const n = seedDesignDocs((m) => say(`  ${m}`));
    say(`✓ ${n || designDocCount()} DESIGN.md indexados`);
    if (flag("images")) {
      const { seed } = await import("./seed.js");
      say("… screenshots de cada sitio (unos 15 min)");
      const s = await seed({ imagesOnly: true, concurrency: Number(opt("concurrency") ?? 3), log: say });
      say(`✓ ${s.done} sitios con imagen, ${s.failures.length} fallidos`);
    } else say("  Las imágenes se capturan cuando las pides (o corre `init --images` para bajarlas todas).");
    await closeBrowser();
    say("\nListo. Agrega el servidor a tu cliente, p. ej.:\n  claude mcp add matiz -s user -- npx -y matiz-mcp");
    return;
  }

  if (cmd === "doctor") {
    const db = openDb();
    const sites = allSites();
    const withImg = sites.filter((s) => s.shots.heroThumb).length;
    const b = await ensureBrowser({ install: false });
    await closeBrowser();
    say(`Node ${process.versions.node} ✓`);
    say(`Datos: ${HOME}`);
    say(`Corpus: ${sites.length} sitios · ${(db.prepare("SELECT count(*) n FROM sections").get() as { n: number }).n} secciones · ${withImg} con imagen`);
    say(`DESIGN.md: ${designDocCount()}`);
    say(`Chromium: ${b.ok ? "listo ✓" : "falta — se instala solo en la primera captura, o corre `matiz-mcp init`"}`);
    if (corpusIsEmpty()) say("⚠ Corpus vacío: corre `npx -y matiz-mcp init`.");
    return;
  }

  if (cmd === "capture") {
    const { captureSite } = await import("./capture/capture.js");
    const urls = args.slice(1).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
    for (const url of urls) {
      try {
        const { record, ms } = await captureSite(url, { tags: opt("tags")?.split(","), industry: opt("industry")?.split(",") });
        say(`✓ ${record.name} (${record.id}) ${(ms / 1000).toFixed(1)}s · ${record.dna.sequence.join(" → ")}`);
      } catch (e) {
        say(`✗ ${url}: ${(e as Error).message.split("\n")[0]}`);
        process.exitCode = 1;
      }
    }
    await closeBrowser();
    return;
  }

  if (cmd === "seed") {
    const { seed } = await import("./seed.js");
    const r = await seed({
      file: opt("file"),
      limit: opt("limit") ? Number(opt("limit")) : undefined,
      only: opt("only"),
      force: flag("force"),
      imagesOnly: flag("images"),
      concurrency: Number(opt("concurrency") ?? 3),
      log: say,
    });
    await closeBrowser();
    say(`Listo: ${r.done} capturados, ${r.failures.length} fallidos.`);
    return;
  }

  if (cmd === "stats") {
    const db = openDb();
    say(JSON.stringify({ sites: allSites().length, sections: db.prepare("SELECT type, count(*) n FROM sections GROUP BY type ORDER BY n DESC").all() }, null, 1));
    return;
  }

  say(`Comando desconocido: ${cmd}. Usa \`matiz-mcp help\`.`);
  process.exitCode = 1;
}

main().then(
  () => {
    if (cmd !== "serve") process.exit(process.exitCode ?? 0);
  },
  (e) => {
    process.stderr.write(`Error: ${(e as Error).message}\n`);
    process.exit(1);
  },
);
