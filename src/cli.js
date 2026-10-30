#!/usr/bin/env node
/**
 * emag-audit — CLI
 *
 *   emag-audit <url|arquivo.html> [--report saida.md] [--json saida.json] [--no-vlibras-hint]
 *
 * Exit code: 1 when any "erro" is found (CI-friendly), 0 otherwise.
 */
import { writeFile } from "node:fs/promises";
import process from "node:process";
import { audit } from "./audit.js";
import { loadHtml } from "./load.js";
import { buildReport } from "./report.js";

const C = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};
const SEV_PAINT = { erro: C.red, aviso: C.yellow, info: C.cyan };

function usage() {
  console.log(`uso: emag-audit <url|arquivo.html> [--report saida.md] [--json saida.json] [--no-vlibras-hint]`);
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) usage();

  const target = args[0];
  const reportPath = args.includes("--report") ? args[args.indexOf("--report") + 1] : null;
  const jsonPath = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
  const brContext = !args.includes("--no-vlibras-hint");

  let html;
  try {
    html = await loadHtml(target);
  } catch (e) {
    const cause = e.cause && (e.cause.code || e.cause.message);
    console.error(C.red(`erro: não foi possível carregar "${target}"`));
    console.error(C.red(`      ${e.message}${cause ? ` (${cause})` : ""}`));
    if (cause === "ENOTFOUND" || cause === "EAI_AGAIN") {
      console.error(C.yellow(`      dica: o domínio não foi encontrado — confira se o endereço está correto.`));
    }
    process.exit(2);
  }

  const result = audit(html, { source: target, isBrazilContext: brContext });

  console.log(C.bold(`\nemag-audit — ${target}`));
  console.log(C.dim(`critérios: WCAG 2.2 · eMAG 3.1 (análise estática)\n`));
  if (result.jsShell) {
    console.log(C.yellow("  ⚠  A página parece ser montada por JavaScript: o HTML recebido é quase só scripts."));
    console.log(C.yellow("     Os achados abaixo descrevem o esqueleto, não o conteúdo real. Para auditar de"));
    console.log(C.yellow("     verdade, salve o HTML renderizado (DevTools → Copy outerHTML) e passe o arquivo.\n"));
  }

  for (const f of result.failed) {
    const paint = SEV_PAINT[f.severity];
    console.log(paint(`  ${f.severity.toUpperCase().padEnd(5)} `) + C.bold(f.title) + C.dim(`  [${f.id}]`));
    console.log(C.dim(`        WCAG ${f.norms.wcag} · eMAG ${f.norms.emag} · ${f.findings.length} ocorrência(s)`));
    for (const ev of f.findings.slice(0, 3)) console.log(C.dim(`        ↳ ${ev.evidence}${ev.detail ? " — " + ev.detail : ""}`));
  }
  if (result.failed.length === 0) console.log(C.green("  Nenhuma barreira detectada pelas verificações automáticas."));

  console.log(
    `\n  ${C.red(result.counts.erro + " erro(s)")} · ${C.yellow(result.counts.aviso + " aviso(s)")} · ` +
    `${C.cyan(result.counts.info + " oportunidade(s)")} · ${C.green(result.passed.length + " critérios ok")}\n`,
  );

  if (reportPath) {
    await writeFile(reportPath, buildReport(result), "utf8");
    console.log(`  relatório instrucional salvo em: ${reportPath}`);
  }
  if (jsonPath) {
    await writeFile(jsonPath, JSON.stringify(result, null, 2), "utf8");
    console.log(`  resultado JSON salvo em: ${jsonPath}`);
  }

  process.exit(result.counts.erro > 0 ? 1 : 0);
}

main();
