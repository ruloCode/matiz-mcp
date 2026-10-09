// Indexa DESIGN.md de repos con licencia abierta (MIT) para search_design_md.
// Clona superficial a <MATIZ_HOME>/sources y guarda cada DESIGN.md con su fuente y licencia.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";
import { HOME, openDb } from "./db.js";

export const DESIGN_MD_SOURCES = [
  { repo: "VoltAgent/awesome-design-md", license: "MIT" },
  { repo: "VoltAgent/awesome-claude-design", license: "MIT" },
  { repo: "bergside/awesome-design-skills", license: "MIT" },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    if (f === ".git" || f === "node_modules") continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/^design\.md$/i.test(f)) out.push(p);
  }
  return out;
}

export function designDocCount(): number {
  return (openDb().prepare("SELECT count(*) AS n FROM design_docs").get() as { n: number }).n;
}

export function seedDesignDocs(log: (m: string) => void = () => {}): number {
  const db = openDb();
  const ins = db.prepare(
    "INSERT INTO design_docs (id, source, name, path, body, tokens) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body, tokens=excluded.tokens",
  );
  const fts = db.prepare("INSERT INTO refs_fts (ref_id, kind, name, heading, body, tags) VALUES (?, 'design-md', ?, ?, ?, ?)");
  let n = 0;
  for (const { repo, license } of DESIGN_MD_SOURCES) {
    const dir = join(HOME, "sources", repo.replace("/", "__"));
    try {
      if (existsSync(dir)) execFileSync("git", ["-C", dir, "pull", "--ff-only", "-q"], { stdio: "ignore" });
      else execFileSync("git", ["clone", "--depth", "1", "-q", `https://github.com/${repo}.git`, dir], { stdio: "ignore" });
    } catch (e) {
      log(`✗ ${repo}: ${(e as Error).message.split("\n")[0]} (¿git instalado?)`);
      continue;
    }
    for (const file of walk(dir)) {
      const body = readFileSync(file, "utf8");
      const rel = relative(dir, file);
      const name = rel.split("/").slice(-2, -1)[0] ?? rel;
      let tokens: Record<string, unknown> = {};
      const fm = body.match(/^---\n([\s\S]*?)\n---/);
      if (fm) {
        try {
          const y = parse(fm[1]) ?? {};
          tokens = { colors: y.colors, typography: y.typography, rounded: y.rounded, spacing: y.spacing };
        } catch {}
      }
      const id = `${repo}:${rel}`;
      db.prepare("DELETE FROM refs_fts WHERE ref_id = ?").run(id);
      ins.run(id, `${repo} (${license})`, name, `https://github.com/${repo}/blob/HEAD/${rel}`, body, JSON.stringify(tokens));
      const headings = (body.match(/^#{1,3} .+$/gm) ?? []).join(" ");
      fts.run(id, name, headings.slice(0, 2000), body.slice(0, 20000), `design-md ${repo} ${Object.keys((tokens.colors as object) ?? {}).join(" ")}`);
      n++;
    }
    log(`✓ ${repo}`);
  }
  return n;
}
