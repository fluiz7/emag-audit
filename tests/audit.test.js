import { describe, expect, it } from "vitest";
import { audit } from "../src/audit.js";

const GOOD = `<!DOCTYPE html>
<html lang="pt-BR"><head><title>Página exemplar — Exemplo</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>
  <a href="#conteudo">Pular para o conteúdo</a>
  <div vw class="enabled"></div>
  <main id="conteudo">
    <h1>Título</h1><h2>Seção</h2>
    <img src="x.png" alt="Diagrama da arquitetura do sistema">
    <button aria-label="Fechar aviso">×</button>
    <label for="nome">Nome</label><input id="nome" type="text">
    <table><caption>Notas</caption><tr><th scope="col">Aluno</th></tr><tr><td>Ana</td></tr></table>
    <a href="https://ex.com" target="_blank">Portal (abre em nova aba)</a>
  </main>
</body></html>`;

const BAD = `<html><head></head><body>
  <center><font size="2">antigo</font></center>
  <img src="banner.jpg">
  <img src="foto.png" alt="foto.png">
  <button></button>
  <a href="#inexistente">quebrado</a>
  <input type="text" placeholder="nome">
  <h2>começa errado</h2><h1>um</h1><h1>dois</h1><h5>salto</h5>
  <iframe src="x.html"></iframe>
  <a href="https://x.com" target="_blank">externo</a>
  <table><tr><td>sem th</td></tr></table>
  <div tabindex="3">foco forçado</div>
  <p id="dup"></p><p id="dup"></p>
</body></html>`;

function ids(result) {
  return result.failed.map((f) => f.id);
}

describe("página exemplar", () => {
  const r = audit(GOOD, { source: "good.html" });
  it("não reporta nenhum erro", () => {
    expect(r.counts.erro).toBe(0);
  });
  it("passa nos critérios centrais", () => {
    const passed = r.passed.map((p) => p.id);
    for (const id of ["pagina-idioma", "pagina-titulo", "img-alt", "controles-sem-nome", "campos-sem-etiqueta", "ancora-conteudo", "vlibras-ausente"]) {
      expect(passed).toContain(id);
    }
  });
});

describe("página com barreiras clássicas", () => {
  const r = audit(BAD, { source: "bad.html" });
  const failedIds = ids(r);

  it.each([
    ["pagina-idioma"], ["pagina-titulo"], ["img-alt"], ["alt-redundante"],
    ["controles-sem-nome"], ["campos-sem-etiqueta"], ["hierarquia-titulos"],
    ["ancora-conteudo"], ["nova-aba-sem-aviso"], ["html-obsoleto"],
    ["iframe-sem-titulo"], ["ancoras-quebradas"], ["tabindex-positivo"],
    ["tabela-sem-cabecalho"], ["ids-duplicados"],
  ])("detecta %s", (id) => {
    expect(failedIds).toContain(id);
  });

  it("hierarquia acusa h1 duplicado e salto de nível", () => {
    const h = r.failed.find((f) => f.id === "hierarquia-titulos");
    const details = h.findings.map((x) => (x.detail || "") + (x.evidence || "")).join(" | ");
    expect(details).toMatch(/2 elementos <h1>/);
    expect(details).toMatch(/salto de h1 para h5/);
  });

  it("cada barreira carrega critério normativo e proposta de correção", () => {
    for (const f of r.failed) {
      expect(f.norms.wcag).toBeTruthy();
      expect(f.norms.emag).toBeTruthy();
      expect(f.fix).toBeTruthy();
    }
  });
});

describe("casos específicos", () => {
  it("viewport com user-scalable=no é erro", () => {
    const r = audit('<html lang="pt-BR"><head><title>t</title><meta name="viewport" content="width=device-width, user-scalable=no"></head><body><h1>x</h1></body></html>');
    expect(ids(r)).toContain("viewport-bloqueado");
  });

  it("autoplay sem controles é erro; com muted+controls passa", () => {
    const bad = audit('<html lang="pt"><head><title>t</title></head><body><h1>x</h1><video autoplay src="v.mp4"></video></body></html>');
    expect(ids(bad)).toContain("midia-autoplay");
    const ok = audit('<html lang="pt"><head><title>t</title></head><body><h1>x</h1><video autoplay muted controls src="v.mp4"></video></body></html>');
    expect(ids(ok)).not.toContain("midia-autoplay");
  });

  it("--no-vlibras-hint (isBrazilContext=false) silencia a dica de VLibras", () => {
    const r = audit("<html lang='en'><head><title>t</title></head><body><h1>x</h1></body></html>", { isBrazilContext: false });
    expect(ids(r)).not.toContain("vlibras-ausente");
  });
});
