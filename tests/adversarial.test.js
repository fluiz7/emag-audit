/**
 * Regression tests from an adversarial review: each case was a false negative
 * (an error the auditor let through) or a false positive (correct markup flagged).
 */
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { audit } from "../src/audit.js";
import { decodeHtml, loadHtml } from "../src/load.js";

const page = (body, head = "") =>
  `<!doctype html><html lang="pt-BR"><head><title>T</title>${head}</head><body>` +
  `<a href="#c">Pular para o conteúdo</a><h1>x</h1><main id="c">${body}</main><div vw></div></body></html>`;

const flags = (html, rule) => audit(html).failed.some((f) => f.id === rule);

describe("falsos negativos — o auditor deixava passar", () => {
  it.each([
    ["aria-labelledby apontando para id inexistente (botão)", page(`<button aria-labelledby="nao-existe"></button>`), "controles-sem-nome"],
    ["aria-labelledby apontando para id inexistente (campo)", page(`<input aria-labelledby="fantasma">`), "campos-sem-etiqueta"],
    ["<label for> vazio", page(`<label for="n"></label><input id="n">`), "campos-sem-etiqueta"],
    ["lang com código inválido", `<!doctype html><html lang="x"><head><title>T</title></head><body><h1>a</h1></body></html>`, "pagina-idioma"],
    ["página que só menciona 'vlibras' no texto", `<!doctype html><html lang="pt-BR"><head><title>T</title></head><body><a href="#c">Pular</a><h1>x</h1><main id="c"><p>Ainda não temos vlibras.</p></main></body></html>`, "vlibras-ausente"],
    ["role=button sem nome", page(`<div role="button" tabindex="0"></div>`), "controles-sem-nome"],
  ])("%s", (_d, html, rule) => {
    expect(flags(html, rule)).toBe(true);
  });
});

describe("falsos positivos — o auditor acusava marcação correta", () => {
  it.each([
    ["link-ícone <svg aria-label>", page(`<a href="/"><svg aria-label="Início"><path/></svg></a>`), "controles-sem-nome"],
    ["link-ícone <svg><title>", page(`<a href="/"><svg role="img"><title>Início</title></svg></a>`), "controles-sem-nome"],
    ["<input title> (técnica H65)", page(`<input type="search" title="Buscar no site">`), "campos-sem-etiqueta"],
    ["aria-labelledby válido", page(`<span id="r">Rótulo</span><input aria-labelledby="r">`), "campos-sem-etiqueta"],
    ["botão submit sem value (nome padrão do navegador)", page(`<input type="submit">`), "controles-sem-nome"],
    ["<button hidden> sem nome", page(`<button hidden></button>`), "controles-sem-nome"],
    ["botão dentro de aria-hidden", page(`<div aria-hidden="true"><button></button></div>`), "controles-sem-nome"],
    ["campo com display:none inline", page(`<input style="display: none">`), "campos-sem-etiqueta"],
    ["tabela de layout role=presentation", page(`<table role="presentation"><tr><td>a</td></tr></table>`), "tabela-sem-cabecalho"],
    ["maximum-scale=2 (cumpre os 200% da 1.4.4)", page("", `<meta name="viewport" content="width=device-width, maximum-scale=2">`), "viewport-bloqueado"],
    ["maximum-scale=10", page("", `<meta name="viewport" content="width=device-width, maximum-scale=10">`), "viewport-bloqueado"],
    ["skip link com ícone + aria-label", `<!doctype html><html lang="pt-BR"><head><title>T</title></head><body><a href="#c" aria-label="Pular para o conteúdo">⤵</a><h1>x</h1><main id="c"></main><div vw></div></body></html>`, "ancora-conteudo"],
    ["VLibras carregado por <script src>", `<!doctype html><html lang="pt-BR"><head><title>T</title><script src="https://vlibras.gov.br/app/vlibras-plugin.js"></script></head><body><a href="#c">Pular</a><h1>x</h1><main id="c">ok</main></body></html>`, "vlibras-ausente"],
    ["lang com subtags (es-419, zh-Hant-TW)", `<!doctype html><html lang="zh-Hant-TW"><head><title>T</title></head><body><h1>a</h1></body></html>`, "pagina-idioma"],
  ])("%s", (_d, html, rule) => {
    expect(flags(html, rule)).toBe(false);
  });

  it("ainda acusa o que deve: maximum-scale=1.5 e user-scalable=no", () => {
    expect(flags(page("", `<meta name="viewport" content="maximum-scale=1.5">`), "viewport-bloqueado")).toBe(true);
    expect(flags(page("", `<meta name="viewport" content="user-scalable=no">`), "viewport-bloqueado")).toBe(true);
  });
});

describe("páginas montadas por JavaScript", () => {
  it("sinaliza um shell de SPA vazio", () => {
    const spa = `<!doctype html><html lang="en"><head><title>App</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`;
    expect(audit(spa).jsShell).toBe(true);
  });

  it("não sinaliza página com conteúdo real que também usa scripts", () => {
    const real = page(`<p>${"Conteúdo real da página institucional. ".repeat(5)}</p><script src="/analytics.js"></script>`);
    expect(audit(real).jsShell).toBe(false);
  });
});

describe("carregamento", () => {
  it("decodifica ISO-8859-1 declarado no <meta charset>", () => {
    const bytes = new Uint8Array(Buffer.from(`<meta charset="iso-8859-1"><p>Cotação</p>`, "latin1"));
    expect(decodeHtml(bytes)).toContain("Cotação");
  });

  it("o Content-Type HTTP tem precedência sobre o <meta>", () => {
    const bytes = new Uint8Array(Buffer.from(`<meta charset="utf-8"><p>Ação</p>`, "latin1"));
    expect(decodeHtml(bytes, "text/html; charset=windows-1252")).toContain("Ação");
  });

  it("charset desconhecido cai para UTF-8 sem lançar exceção", () => {
    const bytes = new Uint8Array(Buffer.from(`<meta charset="nao-existe"><p>Ação</p>`, "utf8"));
    expect(decodeHtml(bytes)).toContain("Ação");
  });

  it("servidor que nunca responde estoura o tempo em vez de travar", async () => {
    const server = createServer(() => { /* nunca responde */ });
    await new Promise((r) => server.listen(0, r));
    const url = `http://127.0.0.1:${server.address().port}/`;
    try {
      await expect(loadHtml(url, { timeoutMs: 300 })).rejects.toThrow(/tempo esgotado/);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});
