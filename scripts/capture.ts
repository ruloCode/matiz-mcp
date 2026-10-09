// Captura uno o varios sitios desde la terminal.
// pnpm capture <url...> [--tags a,b] [--industry x] [--name N] [--dry]
import { captureSite, closeBrowser } from "../src/capture/capture.js";

const args = process.argv.slice(2);
const flag = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const dry = args.includes("--dry") ? (args.splice(args.indexOf("--dry"), 1), true) : false;
const tags = flag("tags")?.split(",");
const industry = flag("industry")?.split(",");
const name = flag("name");

for (const url of args) {
  try {
    const { record, ms } = await captureSite(url, { tags, industry, name, store: !dry });
    const d = record.dna;
    console.log(`✓ ${record.name} (${record.id}) en ${(ms / 1000).toFixed(1)}s`);
    console.log(`  tema ${d.theme} · fondo ${d.palette.background} · texto ${d.palette.text} · acento ${d.palette.accent ?? "—"}`);
    console.log(`  tipografía ${d.typography.pairing}: ${d.typography.families.map((f) => `${f.family}(${f.class})`).join(", ")} · base ${d.typography.baseSize}px · razón ${d.typography.scaleRatio}`);
    console.log(`  radio ${d.shape.radius}px · sombras ${d.shape.shadows} · ancho ${d.layout.contentWidth}px · ${d.layout.density}`);
    console.log(`  secuencia: ${d.sequence.join(" → ")}`);
    console.log(`  botones: ${d.buttons.map((b) => `${b.kind} ${b.bg}/${b.text} r${b.radius} "${b.label}"`).join(" · ")}`);
    console.log(`  industria ${d.industry.join(",") || "—"} · tech ${d.tech.join(",") || "—"} · motion ${d.motion.join(",") || "—"}`);
  } catch (e) {
    console.error(`✗ ${url}: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
await closeBrowser();
process.exit(process.exitCode ?? 0);
