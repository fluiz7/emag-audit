/**
 * Regression tests for the second adversarial review of PR #1 (the author's own review),
 * plus one false positive that only showed up on a real site (poli.ufrj.br).
 * Every case reproduced against the PR branch before being fixed.
 */
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { audit } from "../src/audit.js";
import { loadHtml } from "../src/load.js";

const page = (body, head = "") =>
  `<!doctype html><html lang="pt-BR"><head><title>T</title>${head}</head><body>` +
  `<a href="#c">Pular para o conteúdo</a><h1>x</h1><main id="c">${body}</main><div vw></div></body></html>`;
const bare = (body) => `<!doctype html><html lang="pt-BR"><head><title>T</title></head><body>${body}<div vw></div></body></html>`;
const flags = (html, rule) => audit(html).failed.some((f) => f.id === rule);

describe("1. <input> buttons are audited (the code path existed but no rule reached it)", () => {
  it.each([
    ['<input type="button">', "no value, no label"],
    ['<input type="image" src="buscar.png">', "image button without alt"],
    ['<input type="submit" value="">', 'explicit value="" renders an empty button'],
    ['<input type="reset" value="  ">', "whitespace-only value"],
  ])("%s is flagged (%s)", (html) => {
    expect(flags(page(html), "controles-sem-nome")).toBe(true);
  });

  it.each([
    ['<input type="submit">', "browser default label"],
    ['<input type="button" value="Buscar">', "value"],
    ['<input type="image" src="b.png" alt="Buscar">', "alt"],
    ['<input type="button" aria-label="Buscar">', "aria-label"],
  ])("%s passes (%s)", (html) => {
    expect(flags(page(html), "controles-sem-nome")).toBe(false);
  });
});

describe("2. text of a hidden element referenced directly still names (accname 2A)", () => {
  it("aria-labelledby -> hidden span", () => {
    expect(flags(page(`<span id="l" hidden>Excluir registro</span><button aria-labelledby="l"><svg></svg></button>`), "controles-sem-nome")).toBe(false);
  });
  it("<label for> that is hidden", () => {
    expect(flags(page(`<label for="n" hidden>Nome</label><input id="n">`), "campos-sem-etiqueta")).toBe(false);
  });
  it("a reference to a missing id is still not a name", () => {
    expect(flags(page(`<button aria-labelledby="nada"></button>`), "controles-sem-nome")).toBe(true);
  });
});

describe("3. an implicit <label> does not borrow text from form controls inside it", () => {
  it.each([
    ["<label><select><option>Escolha...</option></select></label>", "the select's own option"],
    ["<label><textarea>Rascunho</textarea></label>", "the textarea's own value"],
    ['<label><input type="text"><button>Buscar</button></label>', "a sibling button"],
  ])("%s is flagged (%s)", (html) => {
    expect(flags(page(html), "campos-sem-etiqueta")).toBe(true);
  });
  it("real label text around the control still counts", () => {
    expect(flags(page(`<label>Estado <select><option>RJ</option></select></label>`), "campos-sem-etiqueta")).toBe(false);
  });
});

describe("4. rules left out of the first unification", () => {
  it("new-tab notice inside an <img alt> is recognised", () => {
    expect(flags(page(`<a href="https://x.gov.br" target="_blank"><img alt="Portal (abre em nova aba)"></a>`), "nova-aba-sem-aviso")).toBe(false);
  });
  it("hidden telemetry iframe is not audited", () => {
    expect(flags(page(`<iframe src="https://gtm" style="display:none;visibility:hidden"></iframe>`), "iframe-sem-titulo")).toBe(false);
  });
  it("visible iframe without title is still flagged", () => {
    expect(flags(page(`<iframe src="mapa.html"></iframe>`), "iframe-sem-titulo")).toBe(true);
  });
  it.each(['<img src="p.gif" hidden>', '<img src="d.png" role="presentation">', '<img src="d.png" role="none">'])(
    "%s is not an img-alt error", (html) => {
      expect(flags(page(html), "img-alt")).toBe(false);
    });
  it.each([
    ['<a href="#c" hidden>Pular para o conteúdo</a><main id="c"></main>', "hidden"],
    ['<a href="#">Pular para o conteúdo</a><main></main>', 'href="#"'],
    ['<a href="#nada">Pular para o conteúdo</a><main></main>', "missing target"],
    ['<a href="#menu">Ir para o menu</a><nav id="menu"></nav>', "points at the menu, not the content"],
  ])("skip link %s does not satisfy the rule (%s)", (html) => {
    expect(flags(bare(html + "<h1>x</h1>"), "ancora-conteudo")).toBe(true);
  });
  it.each([
    ['<a href="#c">Pular para o conteúdo</a><main id="c"></main>'],
    ['<a href="#c">Ir para o conteúdo principal</a><main id="c"></main>'],
    ['<a href="#c">Pular navegação</a><main id="c"></main>'],
    ['<a href="#c">Skip to main content</a><main id="c"></main>'],
  ])("skip link %s satisfies the rule", (html) => {
    expect(flags(bare(html + "<h1>x</h1>"), "ancora-conteudo")).toBe(false);
  });
  it("<svg><text> names a button", () => {
    expect(flags(page(`<button><svg><text x="0" y="10">Entrar</text></svg></button>`), "controles-sem-nome")).toBe(false);
  });
});

describe("4.5 focusable element hidden from assistive technology", () => {
  it.each([
    ['<button aria-hidden="true">x</button>'],
    ['<div aria-hidden="true"><a href="/">link</a></div>'],
    ['<div aria-hidden="true"><input type="text"></div>'],
  ])("%s is reported", (html) => {
    expect(flags(page(html), "foco-oculto")).toBe(true);
  });
  it.each([
    ['<div aria-hidden="true"><button tabindex="-1">x</button></div>', "tabindex=-1"],
    ['<div aria-hidden="true"><button disabled>x</button></div>', "disabled"],
    ['<div aria-hidden="true"><span>texto</span></div>', "nothing focusable"],
    // found on poli.ufrj.br: a closed Bootstrap modal is display:none via its stylesheet
    ['<div class="modal fade" aria-hidden="true"><button aria-label="Fechar">x</button></div>', "closed modal"],
    ['<div class="collapse" aria-hidden="true"><a href="/">x</a></div>', "closed collapse"],
    ['<div class="d-none" aria-hidden="true"><a href="/">x</a></div>', "utility hidden"],
  ])("%s is not reported (%s)", (html) => {
    expect(flags(page(html), "foco-oculto")).toBe(false);
  });
  it("an OPEN modal with aria-hidden is reported", () => {
    expect(flags(page('<div class="modal fade show" aria-hidden="true"><button>x</button></div>'), "foco-oculto")).toBe(true);
  });
  it("is an aviso, not an erro: the stylesheet decides, and static analysis can't see it", () => {
    const f = audit(page('<button aria-hidden="true">x</button>')).failed.find((x) => x.id === "foco-oculto");
    expect(f.severity).toBe("aviso");
  });
});

describe("5. VLibras via a11ybar and body timeout", () => {
  it("a page loading a11ybar with vlibras: true has VLibras", () => {
    const html = bare(`<a href="#c">Pular</a><h1>x</h1><main id="c">ok</main>` +
      `<script>window.A11ybarConfig = { vlibras: true };</script><script src="../src/a11ybar.js"></script>`);
    expect(flags(html, "vlibras-ausente")).toBe(false);
  });
  it("a11ybar WITHOUT vlibras enabled is not counted as VLibras", () => {
    // built by hand: the `bare()` helper already contains a <div vw>, which would mask the case
    const html = `<!doctype html><html lang="pt-BR"><head><title>T</title></head><body><h1>x</h1>` +
      `<script>window.A11ybarConfig = { vlibras: false };</script><script src="a11ybar.js"></script></body></html>`;
    expect(flags(html, "vlibras-ausente")).toBe(true);
  });
  it("a server that stalls while streaming the body times out with the handled message", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.write("<html>"); // headers sent, body never finishes
    });
    await new Promise((r) => server.listen(0, r));
    try {
      await expect(loadHtml(`http://127.0.0.1:${server.address().port}/`, { timeoutMs: 300 }))
        .rejects.toThrow(/tempo esgotado/);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});
