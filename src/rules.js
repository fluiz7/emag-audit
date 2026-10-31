/**
 * Rule registry. Each rule maps to explicit normative criteria (WCAG 2.2 and
 * eMAG 3.1) and returns findings with code evidence — the raw material for an
 * instructional report, not just a pass/fail flag.
 *
 * severity: "erro" (violates a norm) | "aviso" (likely barrier, needs human
 * review) | "info" (opportunity / Brazilian-context recommendation).
 */

import { accessibleName, inTemplate, isFocusable, isHidden, outOfFocusOrder, parseTabindex } from "./accname.js";

/** Ids that exist in the document — `<template>` content is not part of it. */
const documentIds = (root) =>
  new Set(root.querySelectorAll("[id]").filter((el) => !inTemplate(el)).map((el) => el.getAttribute("id")));

// BCP 47 subset: primary language (2-3 letters) + optional subtags (pt-BR, en, es-419, zh-Hant-TW)
const BCP47 = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

// Components that a framework hides with a STYLESHEET while closed (Bootstrap and
// friends): `display:none` takes their content out of the focus order, which static
// analysis cannot see. Verified on poli.ufrj.br: a closed `.modal.fade` with
// aria-hidden="true" would otherwise be reported — on every Bootstrap site.
const COLLAPSED = /(^|\s)(modal|offcanvas|collapse|dropdown-menu|popover|toast)(\s|$)/;
const OPEN = /(^|\s)(show|open|showing|active|in)(\s|$)/;
// NOT `visually-hidden` / `sr-only`: those clip the element off-screen but keep it in the
// Tab order — a focusable `.visually-hidden` inside aria-hidden is exactly the barrier.
const UTILITY_HIDDEN = /(^|\s)(d-none|hidden|is-hidden|invisible)(\s|$)/;

function hiddenByStylesheet(n) {
  const cls = n.getAttribute("class") || "";
  return (COLLAPSED.test(cls) && !OPEN.test(cls)) || UTILITY_HIDDEN.test(cls);
}

/** Focusable element inside aria-hidden="true", unless a closed component hides it. */
function focusableButAriaHidden(el) {
  let ariaHidden = false;
  for (let n = el; n && n.tagName; n = n.parentNode) {
    // (hidden / inert / inline display:none / <template> are handled by isFocusable)
    if (hiddenByStylesheet(n)) return false;
    if (n.getAttribute("aria-hidden") === "true") ariaHidden = true;
  }
  return ariaHidden;
}

const OBSOLETE_TAGS = ["marquee", "blink", "font", "center", "big", "acronym", "applet", "frame", "frameset"];

function snippet(el, max = 120) {
  const html = (el.outerHTML || String(el)).replace(/\s+/g, " ").trim();
  return html.length > max ? html.slice(0, max) + "…" : html;
}

export const rules = [
  {
    id: "pagina-idioma",
    title: "Idioma principal da página declarado",
    severity: "erro",
    norms: { wcag: "3.1.1 Language of Page (A)", emag: "Rec. 3.1" },
    fix: 'Declare o idioma no elemento raiz: `<html lang="pt-BR">`. Leitores de tela usam esse atributo para escolher o sintetizador de voz correto.',
    check(root) {
      const html = root.querySelector("html");
      const lang = html ? (html.getAttribute("lang") || "").trim() : "";
      if (!lang) return [{ evidence: html ? snippet(html, 60) : "<html> ausente", detail: "atributo lang ausente ou vazio" }];
      return BCP47.test(lang) ? [] : [{ evidence: snippet(html, 60), detail: `lang="${lang}" não é um código de idioma válido (BCP 47)` }];
    },
  },
  {
    id: "pagina-titulo",
    title: "Título de página descritivo",
    severity: "erro",
    norms: { wcag: "2.4.2 Page Titled (A)", emag: "Rec. 3.3" },
    fix: "Adicione um `<title>` único e descritivo dentro do `<head>`, no padrão “Assunto — Nome do site”.",
    check(root) {
      const t = root.querySelector("title");
      const txt = t ? t.text.trim() : "";
      return txt ? [] : [{ evidence: t ? "<title></title>" : "<title> ausente" }];
    },
  },
  {
    id: "img-alt",
    title: "Imagens com alternativa textual",
    severity: "erro",
    norms: { wcag: "1.1.1 Non-text Content (A)", emag: "Rec. 3.6" },
    fix: 'Toda `<img>` informativa precisa de `alt` que descreva a função/conteúdo; decorativas devem usar `alt=""` explícito.',
    check(root) {
      return root.querySelectorAll("img")
        .filter((img) => img.getAttribute("alt") === undefined && !isHidden(img))
        .filter((img) => !["presentation", "none"].includes((img.getAttribute("role") || "").toLowerCase()))
        .map((img) => ({ evidence: snippet(img) }));
    },
  },
  {
    id: "alt-redundante",
    title: "Alternativas textuais não redundantes",
    severity: "aviso",
    norms: { wcag: "1.1.1 Non-text Content (A)", emag: "Rec. 3.6" },
    fix: "Substitua alt genérico (\"imagem\", \"foto\", nome do arquivo) por descrição real da função da imagem.",
    check(root) {
      const generic = /^(imagem|image|img|foto|photo|picture|icone|ícone|icon|logo)?$|\.(png|jpe?g|gif|webp|svg)$/i;
      return root.querySelectorAll("img").filter((img) => {
        const alt = (img.getAttribute("alt") || "").trim();
        return alt !== "" && generic.test(alt);
      }).map((img) => ({ evidence: snippet(img), detail: `alt="${img.getAttribute("alt")}"` }));
    },
  },
  {
    id: "controles-sem-nome",
    title: "Botões e links com nome acessível",
    severity: "erro",
    norms: { wcag: "4.1.2 Name, Role, Value (A) · 2.4.4 Link Purpose (A)", emag: "Rec. 3.5 · Rec. 6.1" },
    fix: 'Controles só com ícone precisam de nome: `<button aria-label="Ativar alto contraste">…</button>`. Nunca deixe `<a>`/`<button>` vazios; `<input type="button">` precisa de `value` e `<input type="image">` de `alt`.',
    check(root) {
      const controls = [
        ...root.querySelectorAll("button"), ...root.querySelectorAll("a[href]"),
        ...root.querySelectorAll('[role="button"]'), ...root.querySelectorAll('[role="link"]'),
        ...root.querySelectorAll("input").filter((i) =>
          ["button", "submit", "reset", "image"].includes((i.getAttribute("type") || "").toLowerCase())),
      ];
      return [...new Set(controls)]
        .filter((el) => !isHidden(el) && !accessibleName(el, root))
        .map((el) => ({ evidence: snippet(el) }));
    },
  },
  {
    id: "campos-sem-etiqueta",
    title: "Campos de formulário com etiqueta associada",
    severity: "erro",
    norms: { wcag: "3.3.2 Labels or Instructions (A) · 1.3.1 Info and Relationships (A)", emag: "Rec. 6.2" },
    fix: 'Associe `<label for="id-do-campo">` a cada campo, ou use `aria-label`/`aria-labelledby`. Placeholder não substitui etiqueta.',
    check(root) {
      const fields = [...root.querySelectorAll("input"), ...root.querySelectorAll("select"), ...root.querySelectorAll("textarea")]
        .filter((f) => !["hidden", "submit", "button", "reset", "image"].includes((f.getAttribute("type") || "").toLowerCase()));
      return fields
        .filter((f) => !isHidden(f) && !accessibleName(f, root))
        .map((f) => ({ evidence: snippet(f) }));
    },
  },
  {
    id: "hierarquia-titulos",
    title: "Hierarquia de cabeçalhos correta",
    severity: "aviso",
    norms: { wcag: "1.3.1 Info and Relationships (A) · 2.4.6 Headings and Labels (AA)", emag: "Rec. 1.3" },
    fix: "Use exatamente um `<h1>` por página e não pule níveis (h2 → h4). A hierarquia é o “sumário” de quem navega por leitores de tela.",
    check(root) {
      // hidden headings (and <template> content) are not in the outline a reader navigates
      const hs = root.querySelectorAll("h1,h2,h3,h4,h5,h6").filter((h) => !isHidden(h));
      const findings = [];
      const h1s = hs.filter((h) => h.tagName === "H1");
      if (h1s.length === 0) findings.push({ evidence: "(nenhum <h1> na página)" });
      if (h1s.length > 1) findings.push({ evidence: `${h1s.length} elementos <h1>`, detail: "deve haver apenas um" });
      let prev = 0;
      for (const h of hs) {
        const lvl = Number(h.tagName[1]);
        if (prev > 0 && lvl > prev + 1) findings.push({ evidence: snippet(h, 80), detail: `salto de h${prev} para h${lvl}` });
        prev = lvl;
      }
      return findings;
    },
  },
  {
    id: "ancora-conteudo",
    title: "Âncora “pular para o conteúdo”",
    severity: "aviso",
    norms: { wcag: "2.4.1 Bypass Blocks (A)", emag: "Rec. 1.5" },
    fix: 'Ofereça como primeiro link: `<a href="#conteudo">Pular para o conteúdo</a>`, apontando para `<main id="conteudo" tabindex="-1">`.',
    check(root) {
      const ids = documentIds(root);
      const links = root.querySelectorAll("a[href]").filter((a) => !isHidden(a));
      const hasSkip = links.slice(0, 5).some((a) => {
        const target = (a.getAttribute("href") || "").replace(/^#/, "");
        if (!(a.getAttribute("href") || "").startsWith("#") || !target || !ids.has(target)) return false;
        const txt = accessibleName(a, root).toLowerCase();
        // must point at the CONTENT ("Ir para o menu" is navigation, not a bypass)
        return /conte[uú]do|principal|\bmain\b|\bcontent\b|pular\s+(a\s+)?navega|skip\s+nav/.test(txt);
      });
      return hasSkip ? [] : [{ evidence: "(nenhum link de salto no início da página)" }];
    },
  },
  {
    id: "nova-aba-sem-aviso",
    title: "Links que abrem nova aba sinalizados",
    severity: "aviso",
    norms: { wcag: "3.2.5 Change on Request (AAA)", emag: "Rec. 1.9" },
    fix: 'Avise no próprio link: `Portal da UFRJ <span class="sr-only">(abre em nova aba)</span>` e inclua `rel="noopener"`.',
    check(root) {
      return root.querySelectorAll('a[target="_blank"]').filter((a) => {
        if (isHidden(a)) return false;
        const t = (accessibleName(a, root) + " " + (a.getAttribute("title") || "")).toLowerCase();
        return !/nova (aba|janela)|new (tab|window)/.test(t);
      }).map((a) => ({ evidence: snippet(a) }));
    },
  },
  {
    id: "html-obsoleto",
    title: "Sem elementos HTML obsoletos",
    severity: "erro",
    norms: { wcag: "— (boas práticas de parsing)", emag: "Rec. 1.1 (padrões web)" },
    fix: "Substitua elementos obsoletos por HTML5 semântico + CSS (`<center>` → CSS; `<font>` → CSS; `<marquee>/<blink>` → remova).",
    check(root) {
      return OBSOLETE_TAGS.flatMap((tag) => root.querySelectorAll(tag).filter((el) => !inTemplate(el)).map((el) => ({ evidence: snippet(el, 80), detail: `<${tag}> é obsoleto` })));
    },
  },
  {
    id: "iframe-sem-titulo",
    title: "Iframes com título",
    severity: "erro",
    norms: { wcag: "4.1.2 Name, Role, Value (A)", emag: "Rec. 2.2" },
    fix: 'Adicione `title` descritivo: `<iframe title="Mapa da unidade" …>`.',
    check(root) {
      return root.querySelectorAll("iframe").filter((f) => !isHidden(f) && !accessibleName(f, root))
        .map((f) => ({ evidence: snippet(f) }));
    },
  },
  {
    id: "ancoras-quebradas",
    title: "Âncoras internas apontando para alvos existentes",
    severity: "aviso",
    norms: { wcag: "2.4.1 Bypass Blocks (A)", emag: "Rec. 1.5" },
    fix: "Cada `href=\"#alvo\"` precisa de um elemento com `id=\"alvo\"` na página; remova ou corrija âncoras mortas (`href=\"#\"`).",
    check(root) {
      const ids = documentIds(root);
      return root.querySelectorAll('a[href^="#"]').filter((a) => {
        if (isHidden(a)) return false;
        const target = (a.getAttribute("href") || "").slice(1);
        return target !== "" ? !ids.has(target) : true; // href="#" também é âncora morta
      }).map((a) => ({ evidence: snippet(a) }));
    },
  },
  {
    id: "viewport-bloqueado",
    title: "Zoom do usuário não bloqueado",
    severity: "erro",
    norms: { wcag: "1.4.4 Resize Text (AA)", emag: "Rec. 4.3" },
    fix: 'Remova `user-scalable=no` e `maximum-scale` restritivo da meta viewport: `<meta name="viewport" content="width=device-width, initial-scale=1">`.',
    check(root) {
      const m = root.querySelector('meta[name="viewport"]');
      if (!m) return [];
      const c = (m.getAttribute("content") || "").toLowerCase();
      const noScale = /user-scalable\s*=\s*(no|0)(?![\d.])/.test(c);
      const max = c.match(/maximum-scale\s*=\s*([\d.]+)/);
      const tooLow = max && Number(max[1]) < 2; // WCAG 1.4.4 requires zoom up to 200%
      return noScale || tooLow ? [{ evidence: snippet(m), detail: noScale ? "user-scalable=no" : `maximum-scale=${max[1]} (< 2)` }] : [];
    },
  },
  {
    id: "foco-oculto",
    title: "Elementos focáveis não ocultos de tecnologias assistivas",
    // aviso, not erro: whether the container is display:none can only be decided with
    // the stylesheet, and a CI gate must not fail on what it cannot see
    severity: "aviso",
    norms: { wcag: "4.1.2 Name, Role, Value (A) · 2.4.3 Focus Order (A)", emag: "Rec. 2.1" },
    fix: 'Elemento dentro de `aria-hidden="true"` não pode receber foco: o teclado chega nele, mas o leitor de tela não anuncia nada. Remova o `aria-hidden` ou tire o elemento da ordem de foco (`tabindex="-1"`, `disabled` ou `inert` no contêiner).',
    check(root) {
      return root.querySelectorAll("*")
        .filter((el) => isFocusable(el) && focusableButAriaHidden(el))
        .map((el) => ({ evidence: snippet(el, 100) }));
    },
  },
  {
    id: "tabindex-positivo",
    title: "Sem tabindex positivo",
    severity: "aviso",
    norms: { wcag: "2.4.3 Focus Order (A)", emag: "Rec. 1.4" },
    fix: "Troque `tabindex` > 0 por ordem natural do DOM (`tabindex=\"0\"` só quando necessário). Ordem forçada quebra a navegação por teclado.",
    check(root) {
      return root.querySelectorAll("[tabindex]")
        .filter((el) => parseTabindex(el.getAttribute("tabindex")) > 0 && !outOfFocusOrder(el))
        .map((el) => ({ evidence: snippet(el, 80), detail: `tabindex=${el.getAttribute("tabindex")}` }));
    },
  },
  {
    id: "midia-autoplay",
    title: "Sem mídia com reprodução automática descontrolada",
    severity: "erro",
    norms: { wcag: "1.4.2 Audio Control (A) · 2.2.2 Pause, Stop, Hide (A)", emag: "Rec. 5.4 · Rec. 2.7" },
    fix: "Remova `autoplay` ou garanta `muted` + `controls` visíveis para o usuário pausar.",
    check(root) {
      return [...root.querySelectorAll("video[autoplay]"), ...root.querySelectorAll("audio[autoplay]")]
        .filter((el) => el.getAttribute("muted") === undefined || el.getAttribute("controls") === undefined)
        .map((el) => ({ evidence: snippet(el) }));
    },
  },
  {
    id: "tabela-sem-cabecalho",
    title: "Tabelas de dados com cabeçalhos",
    severity: "aviso",
    norms: { wcag: "1.3.1 Info and Relationships (A)", emag: "Rec. 3.9 · Rec. 3.10" },
    fix: "Use `<th scope=\"col|row\">` para cabeçalhos e `<caption>` para o título da tabela.",
    check(root) {
      return root.querySelectorAll("table")
        .filter((t) => !["presentation", "none"].includes((t.getAttribute("role") || "").toLowerCase()) && !isHidden(t))
        .filter((t) => t.querySelectorAll("th").length === 0)
        .map((t) => ({ evidence: snippet(t, 80) }));
    },
  },
  {
    id: "ids-duplicados",
    title: "IDs únicos no documento",
    severity: "aviso",
    norms: { wcag: "1.3.1 / 4.1.2 (referências ARIA e labels dependem de IDs únicos)", emag: "Rec. 1.1" },
    fix: "Garanta que cada `id` apareça uma única vez — `label[for]`, `aria-labelledby` e âncoras dependem disso.",
    check(root) {
      const seen = new Map();
      // hidden elements still count (a hidden duplicate breaks label[for] / aria-labelledby);
      // <template> content does not — it is not in the document
      for (const el of root.querySelectorAll("[id]").filter((e) => !inTemplate(e))) {
        const id = el.getAttribute("id");
        seen.set(id, (seen.get(id) || 0) + 1);
      }
      return [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => ({ evidence: `id="${id}"`, detail: `${n} ocorrências` }));
    },
  },
  {
    id: "vlibras-ausente",
    title: "Tradução automática em Libras (VLibras)",
    severity: "info",
    norms: { wcag: "—", emag: "LBI — Lei 13.146/2015, art. 63 (contexto brasileiro)" },
    fix: "Considere integrar o widget gratuito VLibras (vlibras.gov.br) — ou a barra a11ybar, que o carrega sob demanda.",
    check(root, ctx) {
      if (!ctx.isBrazilContext) return [];
      const scripts = root.querySelectorAll("script");
      const has = root.querySelector("[vw]") ||
        scripts.some((s) => /vlibras/i.test(s.getAttribute("src") || "")) ||
        // a11ybar loads VLibras on demand: its script + `vlibras: true` in its config
        (scripts.some((s) => /a11ybar/i.test(s.getAttribute("src") || "")) &&
          scripts.some((s) => /vlibras\s*:\s*true/.test(s.text || "")));
      return has ? [] : [{ evidence: "(widget VLibras não detectado)" }];
    },
  },
];
