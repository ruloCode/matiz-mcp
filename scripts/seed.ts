// pnpm seed [--file path] [--concurrency 3] [--only fintech] [--limit 20] [--force] [--images]
import { seed } from "../src/seed.js";
import { closeBrowser } from "../src/capture/capture.js";

const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const r = await seed({
  file: opt("file"),
  concurrency: Number(opt("concurrency") ?? 3),
  only: opt("only"),
  limit: opt("limit") ? Number(opt("limit")) : undefined,
  force: args.includes("--force"),
  imagesOnly: args.includes("--images"),
});
await closeBrowser();
console.log(`Listo: ${r.done} capturados, ${r.failures.length} fallidos`);
process.exit(0);
