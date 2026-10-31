# emag-audit

> Static accessibility auditor for the **Brazilian standards ecosystem**: 19 checks mapped to **WCAG 2.2 + eMAG 3.1**, producing an **instructional Markdown report** (diagnosis → proposals with normative criteria and fix code) — the exact deliverable format Brazilian public institutions work with.

[![CI](https://github.com/fluiz7/emag-audit/actions/workflows/ci.yml/badge.svg)](https://github.com/fluiz7/emag-audit/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/Node-20+-339933?style=flat&logo=nodedotjs&logoColor=white)
![WCAG 2.2](https://img.shields.io/badge/WCAG-2.2-005A9C?style=flat)
![eMAG 3.1](https://img.shields.io/badge/eMAG-3.1-1351B4?style=flat)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

International tools (axe, WAVE) speak WCAG — but Brazilian government sites answer to **eMAG** and, since 2025, **ABNT NBR 17225**, and the official Brazilian evaluator (ASES) is abandoned. Auditing public-sector sites at **UFRJ (EMAR/DIRAC)**, the deliverable was never a raw error list: it was an *instructional report* — what works, which barrier violates which norm, and step-by-step fixes the IT team can apply. **emag-audit automates that workflow.**

## Quickstart

```bash
# direto do GitHub (sem instalar):
npx github:fluiz7/emag-audit https://exemplo.gov.br --report relatorio.md

# ou clonando:
git clone https://github.com/fluiz7/emag-audit && cd emag-audit && npm install
node src/cli.js ./pagina.html --json resultado.json
```

> Publicação no registro npm está no roadmap; por ora use `npx github:`.

Console output (colored, norm-referenced):

```
emag-audit — https://exemplo.gov.br
critérios: WCAG 2.2 · eMAG 3.1 (análise estática)

  ERRO  Botões e links com nome acessível  [controles-sem-nome]
        WCAG 4.1.2 Name, Role, Value (A) · eMAG Rec. 3.5 · Rec. 6.1 · 5 ocorrência(s)
        ↳ <button class="btncontrast"><i class="fa fa-adjust" aria-hidden="true"></i></button>
  AVISO Âncoras internas apontando para alvos existentes  [ancoras-quebradas]
        ...

  2 erro(s) · 3 aviso(s) · 1 oportunidade(s) · 12 critérios ok
```

`--report relatorio.md` writes the full instructional report: **1) Diagnóstico** (acertos ✅ + barreiras com evidência de código) → **2) Propostas de implementação** (per barrier: normative criterion + fix guidance), in pt-BR, ready to attach to an institutional process.

## The 19 checks

| Check | WCAG 2.2 | eMAG 3.1 |
|---|---|---|
| Idioma da página (`lang`) | 3.1.1 | 3.1 |
| Título de página | 2.4.2 | 3.3 |
| `alt` em imagens | 1.1.1 | 3.6 |
| `alt` não redundante (nome de arquivo, "foto"…) | 1.1.1 | 3.6 |
| Botões/links com nome acessível | 4.1.2 · 2.4.4 | 3.5 · 6.1 |
| Campos com etiqueta associada | 3.3.2 · 1.3.1 | 6.2 |
| Hierarquia de cabeçalhos (um `h1`, sem saltos) | 1.3.1 · 2.4.6 | 1.3 |
| Âncora "pular para o conteúdo" | 2.4.1 | 1.5 |
| Aviso em links `target="_blank"` | 3.2.5 | 1.9 |
| Elementos HTML obsoletos | — | 1.1 |
| `title` em iframes | 4.1.2 | 2.2 |
| Âncoras internas quebradas (`href="#…"`) | 2.4.1 | 1.5 |
| Zoom não bloqueado (viewport) | 1.4.4 | 4.3 |
| Sem `tabindex` positivo | 2.4.3 | 1.4 |
| Nada focável dentro de `aria-hidden="true"` — *aviso: o stylesheet decide* | 4.1.2 · 2.4.3 | 2.1 |
| Mídia sem autoplay descontrolado | 1.4.2 · 2.2.2 | 5.4 · 2.7 |
| Tabelas de dados com `th`/`caption` | 1.3.1 | 3.9 · 3.10 |
| IDs únicos | 1.3.1 · 4.1.2 | 1.1 |
| VLibras (Libras) presente — *info, contexto BR* | — | LBI 13.146/2015 |

> Static analysis has limits by design: contrast, keyboard traps and dynamic behaviour need a rendering engine and human testing (NVDA/Talkback). emag-audit covers the structural layer — the same one WAVE/AMAWeb converge on — and tells you *how to fix what it finds*.

### How "accessible name" is computed

Every check that asks *"does this element have a name?"* uses one shared module, [`src/accname.js`](src/accname.js) — a static subset of the W3C [Accessible Name Computation](https://www.w3.org/TR/accname-1.2/): `aria-labelledby` (resolved — a reference to a missing id is **not** a name; a *hidden* element referenced directly **is**, per accname 2A) → `aria-label` → `<label>` → content (including `<img alt>`, `<svg aria-label>`, `<svg><title>` and `<svg><text>`) → `title`. `<input type="button|submit|reset|image">` are audited too (`value` / `alt`; `value=""` renders an empty button). Elements removed from the accessibility tree (`hidden`, `aria-hidden="true"`, inline `display:none`) are not audited. Two deliberate choices: placeholder is never accepted as a name, and an implicit `<label>` does not borrow text from form controls inside it (an `<option>`, a textarea's value or a sibling button are not a label).

### Pages rendered by JavaScript

If the HTML is an empty shell filled in by a framework (React, Vue, Angular…), static analysis sees the skeleton, not the page. emag-audit detects this and **says so** in the console and the report instead of presenting "no `<h1>`" as a real barrier. To audit such a page, save the rendered HTML (DevTools → *Copy outerHTML*) and pass the file.

### Encodings and timeouts

Pages are decoded with their declared charset (HTTP `Content-Type`, then `<meta charset>`) — many `.gov.br` and older university pages are still ISO-8859-1, and decoding them as UTF-8 garbles the evidence quoted in the report. Fetching a URL times out after 20 s instead of hanging a CI job.

**Field-validated:** run against a real Brazilian public-university site previously audited with WAVE and AMAWeb, emag-audit reproduced the professional toolchain's error set — the empty icon-buttons, the logo missing `alt` and the broken internal anchors — while attaching the eMAG/WCAG criterion and the fix to each one.

## Use in CI

Exit code is `1` when any **erro**-severity barrier is found:

```yaml
- run: npx github:fluiz7/emag-audit https://staging.meusite.gov.br
```

## Programmatic API

```js
import { audit } from "emag-audit";
const result = audit(html, { source: "pagina.html" });
// { passed, failed: [{ id, title, severity, norms, fix, findings }], counts, jsShell }
```

## Sister project

[**a11ybar**](https://github.com/fluiz7/a11ybar) — the drop-in accessibility toolbar (font scaling, eMAG high contrast, reading comfort, VLibras). *emag-audit finds the barriers; a11ybar ships the remediations.*

## License

[MIT](LICENSE) — © Luiz Felipe Cantanhede Cristino.
