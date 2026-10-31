/**
 * Regression tests for the third adversarial review of PR #1 (review of commit a465170).
 * Every case reproduced against that commit before being fixed.
 */
import { describe, expect, it } from "vitest";
import { audit } from "../src/audit.js";

const page = (body) =>
  `<!doctype html><html lang="pt-BR"><head><title>T</title></head><body>` +
  `<a href="#c">Pular para o conteúdo</a><h1>x</h1><main id="c">${body}</main><div vw></div></body></html>`;
const flags = (html, rule) => audit(html).failed.some((f) => f.id === rule);

describe("1. hidden content counts only when the REFERENCED node itself is hidden (accname 2A)", () => {
  it("an aria-hidden asterisk inside a visible <label for> is not a name", () => {
    expect(flags(page(`<label for="cpf"><span aria-hidden="true">*</span></label><input id="cpf">`), "campos-sem-etiqueta")).toBe(true);
  });
  it("a hidden span inside a VISIBLE labelledby target is not a name", () => {
    expect(flags(page(`<div id="lbl"><span hidden>Rascunho</span></div><button aria-labelledby="lbl"></button>`), "controles-sem-nome")).toBe(true);
  });
  it("visible text next to the decorative asterisk still names the field", () => {
    expect(flags(page(`<label for="cpf">CPF <span aria-hidden="true">*</span></label><input id="cpf">`), "campos-sem-etiqueta")).toBe(false);
  });
  it("a HIDDEN labelledby target still names, with its whole subtree", () => {
    expect(flags(page(`<div id="l" hidden><span>Excluir</span> registro</div><button aria-labelledby="l"></button>`), "controles-sem-nome")).toBe(false);
  });
});

describe("2. foco-oculto knows what markup takes an element out of the focus order", () => {
  it.each([
    ['<div aria-hidden="true" inert><button>Fechar</button></div>', "inert"],
    ['<fieldset disabled aria-hidden="true"><button>Fechar</button></fieldset>', "disabled fieldset"],
    ['<div aria-hidden="true" style="display:none"><button>Fechar</button></div>', "inline display:none"],
    ['<div aria-hidden="true" style="visibility: hidden"><a href="/">x</a></div>', "inline visibility:hidden"],
    ['<template><div aria-hidden="true"><button>x</button></div></template>', "<template>"],
  ])("%s is not reported (%s)", (html) => {
    expect(flags(page(html), "foco-oculto")).toBe(false);
  });

  it("a .visually-hidden button inside aria-hidden IS reported — it stays in the Tab order", () => {
    expect(flags(page('<button class="visually-hidden" aria-hidden="true">x</button>'), "foco-oculto")).toBe(true);
  });

  it("the first <legend> of a disabled fieldset stays enabled (HTML), so it is reported", () => {
    const html = page('<fieldset disabled aria-hidden="true"><legend><a href="/ajuda">ajuda</a></legend><button>x</button></fieldset>');
    const f = audit(html).failed.find((x) => x.id === "foco-oculto");
    expect(f.findings).toHaveLength(1);
    expect(f.findings[0].evidence).toContain("ajuda");
  });
});

describe("3. a <label for> labels its target only, even when it wraps another control", () => {
  it("#este, wrapped by <label for=outro>, has no label", () => {
    expect(flags(page(`<label for="outro">Nome <input id="este"></label><input id="outro">`), "campos-sem-etiqueta")).toBe(true);
  });
  it("the wrapped control IS labelled when `for` points at it", () => {
    expect(flags(page(`<label for="este">Nome <input id="este"></label>`), "campos-sem-etiqueta")).toBe(false);
  });
  it("a wrapping label without `for` still labels the control inside", () => {
    expect(flags(page(`<label>Nome <input></label>`), "campos-sem-etiqueta")).toBe(false);
  });
});
