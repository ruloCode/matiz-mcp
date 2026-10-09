// Evalúa el clasificador de secciones contra research/eval/labels-*.json (etiquetas a ciegas).
// pnpm eval  → exactitud estricta, exactitud con la etiqueta secundaria, precisión/recall por tipo
// y las confusiones más frecuentes. Excluye "unclear" (capturas malas, no secciones ambiguas).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { getSite } from "../src/db.js";

type Label = { ref_id: string; label: string; secondary: string | null; note?: string };
// pnpm eval [ajuste|holdout] [salida.json]
const set = process.argv[2] === "holdout" ? "holdout" : "ajuste";
const prefix = set === "holdout" ? "holdout-labels-" : "labels-";
const labels: Label[] = readdirSync("research/eval")
  .filter((f) => f.startsWith(prefix) && /-\d+\.json$/.test(f))
  .flatMap((f) => JSON.parse(readFileSync(`research/eval/${f}`, "utf8")));

// sitios recapturados después de etiquetar: sus índices de sección pudieron moverse
const stale = new Set<string>(existsSync("research/eval/stale-hosts.json") ? JSON.parse(readFileSync("research/eval/stale-hosts.json", "utf8")) : []);
const rows: Array<{ ref: string; gold: string; second: string | null; pred: string }> = [];
let unclear = 0;
let missing = 0;
for (const l of labels) {
  if (l.label === "unclear") {
    unclear++;
    continue;
  }
  const [id, idx] = l.ref_id.split("#");
  const site = getSite(id);
  if (site && stale.has(site.host ?? "")) {
    missing++;
    continue;
  }
  const sec = site?.dna.sections.find((s) => s.idx === +idx);
  if (!sec) {
    missing++;
    continue;
  }
  rows.push({ ref: l.ref_id, gold: l.label, second: l.secondary, pred: sec.type });
}
const n = rows.length;
const strict = rows.filter((r) => r.pred === r.gold).length;
const lenient = rows.filter((r) => r.pred === r.gold || r.pred === r.second).length;
const types = [...new Set(rows.flatMap((r) => [r.gold, r.pred]))].sort();
const per = types
  .map((t) => {
    const tp = rows.filter((r) => r.pred === t && r.gold === t).length;
    const predN = rows.filter((r) => r.pred === t).length;
    const goldN = rows.filter((r) => r.gold === t).length;
    return { type: t, gold: goldN, predicted: predN, precision: predN ? +(tp / predN).toFixed(2) : null, recall: goldN ? +(tp / goldN).toFixed(2) : null };
  })
  .filter((x) => x.gold || x.predicted);
const conf = new Map<string, number>();
for (const r of rows) if (r.pred !== r.gold) conf.set(`${r.gold} → ${r.pred}`, (conf.get(`${r.gold} → ${r.pred}`) ?? 0) + 1);
const report = {
  date: new Date().toISOString().slice(0, 10),
  evaluated: n,
  excluded_unclear: unclear,
  missing,
  accuracy: +(strict / n).toFixed(3),
  accuracy_with_secondary: +(lenient / n).toFixed(3),
  content_rate_predicted: +(rows.filter((r) => r.pred === "content").length / n).toFixed(3),
  per_type: per,
  top_confusions: [...conf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => ({ confusion: k, n: v })),
};
const outFile = process.argv[3] ?? (set === "holdout" ? "research/eval/report-holdout.json" : "research/eval/report.json");
writeFileSync(outFile, JSON.stringify({ set, ...report }, null, 1));
console.log(`[${set}] n=${n} (fuera ${unclear} unclear, ${missing} sin sección)`);
console.log(`exactitud ${(report.accuracy * 100).toFixed(1)}% · con secundaria ${(report.accuracy_with_secondary * 100).toFixed(1)}% · "content" predicho ${(report.content_rate_predicted * 100).toFixed(1)}%`);
for (const p of per) console.log(`  ${p.type.padEnd(14)} gold ${String(p.gold).padStart(2)} pred ${String(p.predicted).padStart(2)}  P ${p.precision ?? "—"}  R ${p.recall ?? "—"}`);
console.log("confusiones:", report.top_confusions.map((c) => `${c.confusion} (${c.n})`).join(" · "));
