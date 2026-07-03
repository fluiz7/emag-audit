/**
 * Instructional Markdown report, in the structure Brazilian public institutions
 * use for accessibility deliverables (diagnosis first, then implementation
 * proposals with normative criteria and code) — the format practiced in
 * DIRAC/UFRJ audit work.
 */

const SEV_LABEL = { erro: "Erro", aviso: "Aviso", info: "Oportunidade" };

export function buildReport(result) {
  const date = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const lines = [];
  const p = (s = "") => lines.push(s);

  p(`# Relatório de Acessibilidade — ${result.source}`);
  p();
  p(`> Gerado por [emag-audit](https://github.com/fluiz7/emag-audit) em ${date}.`);
  p(`> Critérios: **WCAG 2.2** e **eMAG 3.1** (ecossistema ABNT NBR 17225:2025).`);
  p(`> Análise estática do HTML — complemente com testes manuais (NVDA/Talkback) e ferramentas como WAVE/AMAWeb.`);
  p();
  p(`**Resumo:** ${result.counts.erro} erro(s) · ${result.counts.aviso} aviso(s) · ${result.counts.info} oportunidade(s) · ${result.passed.length} critérios atendidos.`);
  p();

  p(`## 1. Diagnóstico`);
  p();
  p(`### 1.1 Acertos`);
  p();
  if (result.passed.length === 0) p(`(nenhum critério plenamente atendido)`);
  for (const ok of result.passed) p(`- ✅ **${ok.title}** — ${ok.norms.wcag !== "—" ? "WCAG " + ok.norms.wcag : ""}${ok.norms.wcag !== "—" && ok.norms.emag !== "—" ? " · " : ""}${ok.norms.emag !== "—" ? "eMAG " + ok.norms.emag : ""}`);
  p();

  p(`### 1.2 Barreiras encontradas`);
  p();
  if (result.failed.length === 0) p(`Nenhuma barreira detectada pelas verificações automáticas. 🎉`);
  result.failed.forEach((f, i) => {
    p(`#### B${i + 1}. ${f.title} — ${SEV_LABEL[f.severity]}`);
    p();
    p(`- **Critério normativo:** WCAG ${f.norms.wcag} · eMAG ${f.norms.emag}`);
    p(`- **Ocorrências:** ${f.findings.length}`);
    for (const ev of f.findings.slice(0, 5)) {
      p(`  - \`${ev.evidence.replace(/`/g, "'")}\`${ev.detail ? ` — ${ev.detail}` : ""}`);
    }
    if (f.findings.length > 5) p(`  - … e mais ${f.findings.length - 5} ocorrência(s).`);
    p();
  });

  p(`## 2. Propostas de implementação`);
  p();
  if (result.failed.length === 0) p(`Sem propostas — mantenha o monitoramento contínuo.`);
  result.failed.forEach((f, i) => {
    p(`### B${i + 1} → ${f.title}`);
    p();
    p(f.fix);
    p();
  });

  p(`---`);
  p(`*Relatório automático; a implementação deve ser validada com usuários reais e leitores de tela.*`);
  return lines.join("\n");
}
