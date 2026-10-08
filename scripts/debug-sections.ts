import { captureSite, closeBrowser } from "../src/capture/capture.js";
import { writeFileSync } from "node:fs";
for (const u of process.argv.slice(2)) {
  const { record, raw } = await captureSite(u, { store: false });
  writeFileSync(`test/fixtures/${record.id}.raw.json`, JSON.stringify(raw));
  console.log("==", record.id, "contentWidth", raw.contentWidth, "h", raw.pageHeight);
  for (const s of record.dna.sections) console.log(String(s.idx).padStart(2), s.type.padEnd(13), s.confidence, `${s.top}+${s.height}`, `cols${s.columns}`, "|", s.reasons.join("; "), "|", s.heading.slice(0, 50), "|", s.text.slice(0, 70));
}
await closeBrowser();
