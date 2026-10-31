/**
 * Regression tests for the fourth adversarial review of PR #1 (review of commit 8bc7591).
 * Every case reproduced against that commit before being fixed — except 2, which pins
 * accname 1.2 step 2A as written (see the describe block).
 */
import { describe, expect, it } from "vitest";
import { parse } from "node-html-parser";
import { audit } from "../src/audit.js";
import { accessibleName, isFocusable, parseTabindex } from "../src/accname.js";

const page = (body) =>
  `<!doctype html><html lang="pt-BR"><head><title>T</title></head><body>` +
  `<a href="#c">Pular para o conteúdo</a><h1>x</h1><main id="c">${body}</main><div vw></div></body></html>`;
const flags = (html, rule) => audit(html).failed.some((f) => f.id === rule);
const el = (html) => parse(html).querySelector("span");

describe("1. tabindex is parsed the way browsers parse it", () => {
  // values and results measured in Chromium: element.tabIndex and whether focus() lands
  it.each([["", NaN], ["   ", NaN], ["abc", NaN], ["-x", NaN], ["2px", 2], [" 3", 3], ["+1", 1], ["1.5", 1], ["-1", -1], ["0", 0]])(
    "parseTabindex(%j) = %s", (value, expected) => {
      expect(parseTabindex(value)).toBe(expected);
    });

  it("an invalid tabindex does not make a <span> focusable", () => {
    expect(isFocusable(el('<span tabindex="">x</span>'))).toBe(false);
    expect(isFocusable(el('<span tabindex="abc">x</span>'))).toBe(false);
  });

  it("an invalid tabindex keeps native focusability", () => {
    expect(isFocusable(parse('<a href="/x" tabindex="abc">x</a>').querySelector("a"))).toBe(true);
  });

  it("foco-oculto ignores invalid tabindex, still flags 2px", () => {
    expect(flags(page('<div aria-hidden="true"><span tabindex="">x</span><span tabindex="abc">y</span></div>'), "foco-oculto")).toBe(false);
    expect(flags(page('<div aria-hidden="true"><span tabindex="2px">z</span></div>'), "foco-oculto")).toBe(true);
  });

  it("tabindex-positivo reads 2px as 2 and ignores junk", () => {
    expect(flags(page('<span tabindex="2px">z</span>'), "tabindex-positivo")).toBe(true);
    expect(flags(page('<span tabindex="abc">z</span>'), "tabindex-positivo")).toBe(false);
  });
});

describe("2. a HIDDEN referenced node contributes its whole subtree (accname 1.2 step 2A, kept)", () => {
  // 2A returns "" for a hidden node only when it is NOT part of an aria-labelledby traversal
  // "where the node directly referenced by that relation was hidden". A node inside a hidden
  // ancestor is itself hidden. So in these traversals hidden descendants DO count.
  it("aria-hidden icon inside a hidden labelledby target is part of the name", () => {
    const r = parse('<div><span id="l" hidden>Salvar <i aria-hidden="true">💾</i></span><button id="b" aria-labelledby="l"></button></div>');
    expect(accessibleName(r.querySelector("#b"), r)).toBe("Salvar 💾");
  });
  it("target inside a hidden ancestor is hidden, so its hidden children count", () => {
    const r = parse('<div hidden><span id="l">Visível <span hidden>Secreto</span></span><button id="b" aria-labelledby="l"></button></div>');
    expect(accessibleName(r.querySelector("#b"), r)).toBe("Visível Secreto");
  });
});

describe("3. <template> content and hidden elements", () => {
  const tpl = '<template><h1>Molde</h1><a href="#">Link molde</a><div tabindex="2">Item</div><p id="dup">t</p><center>c</center></template>';

  it("hierarquia-titulos ignores headings in <template> and hidden headings", () => {
    expect(flags(page(tpl + "<h1 hidden>Oculto</h1>"), "hierarquia-titulos")).toBe(false);
  });
  it("ancoras-quebradas ignores template and hidden links", () => {
    expect(flags(page(tpl + '<a href="#" hidden>x</a>'), "ancoras-quebradas")).toBe(false);
  });
  it("ancoras-quebradas: an id that exists only inside <template> is not a target", () => {
    expect(flags(page('<a href="#so-no-molde">x</a><template><p id="so-no-molde">t</p></template>'), "ancoras-quebradas")).toBe(true);
  });
  it("tabindex-positivo ignores template and hidden elements", () => {
    expect(flags(page(tpl + '<div hidden tabindex="3">x</div>'), "tabindex-positivo")).toBe(false);
  });
  it("ids-duplicados ignores <template> but still counts hidden duplicates", () => {
    expect(flags(page(tpl + '<p id="dup">x</p>'), "ids-duplicados")).toBe(false);
    expect(flags(page('<p id="d2">x</p><p id="d2" hidden>y</p>'), "ids-duplicados")).toBe(true);
  });
  it("html-obsoleto ignores <template>", () => {
    expect(flags(page(tpl), "html-obsoleto")).toBe(false);
  });
  it("visible problems are still found", () => {
    expect(flags(page("<h1>dois</h1>"), "hierarquia-titulos")).toBe(true);
    expect(flags(page('<a href="#">morto</a>'), "ancoras-quebradas")).toBe(true);
    expect(flags(page('<div tabindex="2">x</div>'), "tabindex-positivo")).toBe(true);
    expect(flags(page("<center>c</center>"), "html-obsoleto")).toBe(true);
  });
});
