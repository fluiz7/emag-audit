/**
 * Rule registry. Each rule maps to explicit normative criteria (WCAG 2.2 and
 * eMAG 3.1) and returns findings with code evidence — the raw material for an
 * instructional report, not just a pass/fail flag.
 *
 * severity: "erro" (violates a norm) | "aviso" (likely barrier, needs human
 * review) | "info" (opportunity / Brazilian-context recommendation).
 */

const OBSOLETE_TAGS = ["marquee", "blink", "font", "center", "big", "acronym", "applet", "frame", "frameset"];

function snippet(el, max = 120) {
  const html = (el.outerHTML || String(el)).replace(/\s+/g, " ").trim();
  return html.length > max ? html.slice(0, max) + "…" : html;
}

function accessibleName(el) {
  const aria = (el.getAttribute("aria-label") || "").trim();
  if (aria) return aria;
  if ((el.getAttribute("aria-labelledby") || "").trim()) return "[aria-labelledby]";
  const text = (el.structuredText || el.text || "").trim();
  if (text) return text;
  const img = el.querySelector && el.querySelector("img[alt]");
  if (img && (img.getAttribute("alt") || "").trim()) return img.getAttribute("alt").trim();
  const title = (el.getAttribute("title") || "").trim();
  if (title) return title;
  if (el.tagName === "INPUT") {
    const v = (el.getAttribute("value") || "").trim();
    if (v && ["submit", "button", "reset"].includes((el.getAttribute("type") || "").toLowerCase())) return v;
  }
  return "";
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
      return lang ? [] : [{ evidence: html ? snippet(html, 60) : "<html> ausente", detail: "atributo lang ausente ou vazio" }];
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
      return root.querySelectorAll("img").filter((img) => img.getAttribute("alt") === undefined)
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
    fix: 'Controles só com ícone precisam de nome: `<button aria-label="Ativar alto contraste">…</button>`. Nunca deixe `<a>`/`<button>` vazios.',
    check(root) {
      return [...root.querySelectorAll("button"), ...root.querySelectorAll("a[href]")]
        .filter((el) => !accessibleName(el))
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
      const labeledFor = new Set(root.querySelectorAll("label[for]").map((l) => l.getAttribute("for")));
      const fields = [...root.querySelectorAll("input"), ...root.querySelectorAll("select"), ...root.querySelectorAll("textarea")]
        .filter((f) => !["hidden", "submit", "button", "reset", "image"].includes((f.getAttribute("type") || "").toLowerCase()));
      return fields.filter((f) => {
        const id = f.getAttribute("id");
        if (id && labeledFor.has(id)) return false;
        if ((f.getAttribute("aria-label") || "").trim()) return false;
        if ((f.getAttribute("aria-labelledby") || "").trim()) return false;
        let p = f.parentNode;
        while (p) { if (p.tagName === "LABEL") return false; p = p.parentNode; }
        return true;
      }).map((f) => ({ evidence: snippet(f) }));
    },
  },
  {
    id: "hierarquia-titulos",
    title: "Hierarquia de cabeçalhos correta",
    severity: "aviso",
    norms: { wcag: "1.3.1 Info and Relationships (A) · 2.4.6 Headings and Labels (AA)", emag: "Rec. 1.3" },
    fix: "Use exatamente um `<h1>` por página e não pule níveis (h2 → h4). A hierarquia é o “sumário” de quem navega por leitores de tela.",
    check(root) {
      const hs = root.querySelectorAll("h1,h2,h3,h4,h5,h6");
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
      const links = root.querySelectorAll("a[href]");
      const hasSkip = links.slice(0, 5).some((a) => {
        const href = a.getAttribute("href") || "";
        const txt = (a.text || "").toLowerCase();
        return href.startsWith("#") && /pular|ir para|skip|conte[uú]do/.test(txt);
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
        const t = ((a.text || "") + " " + (a.getAttribute("aria-label") || "") + " " + (a.getAttribute("title") || "")).toLowerCase();
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
      return OBSOLETE_TAGS.flatMap((tag) => root.querySelectorAll(tag).map((el) => ({ evidence: snippet(el, 80), detail: `<${tag}> é obsoleto` })));
    },
  },
  {
    id: "iframe-sem-titulo",
    title: "Iframes com título",
    severity: "erro",
    norms: { wcag: "4.1.2 Name, Role, Value (A)", emag: "Rec. 2.2" },
    fix: 'Adicione `title` descritivo: `<iframe title="Mapa da unidade" …>`.',
    check(root) {
      return root.querySelectorAll("iframe").filter((f) => !(f.getAttribute("title") || "").trim())
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
      const ids = new Set(root.querySelectorAll("[id]").map((el) => el.getAttribute("id")));
      return root.querySelectorAll('a[href^="#"]').filter((a) => {
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
      const blocked = /user-scalable\s*=\s*(no|0)/.test(c) || /maximum-scale\s*=\s*([01](\.\d+)?|2(\.0*)?)(?![\d.])/.test(c);
      return blocked ? [{ evidence: snippet(m) }] : [];
    },
  },
  {
    id: "tabindex-positivo",
    title: "Sem tabindex positivo",
    severity: "aviso",
    norms: { wcag: "2.4.3 Focus Order (A)", emag: "Rec. 1.4" },
    fix: "Troque `tabindex` > 0 por ordem natural do DOM (`tabindex=\"0\"` só quando necessário). Ordem forçada quebra a navegação por teclado.",
    check(root) {
      return root.querySelectorAll("[tabindex]").filter((el) => Number(el.getAttribute("tabindex")) > 0)
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
      return root.querySelectorAll("table").filter((t) => t.querySelectorAll("th").length === 0)
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
      for (const el of root.querySelectorAll("[id]")) {
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
      const has = root.querySelector("[vw]") || (root.outerHTML || "").includes("vlibras");
      return has ? [] : [{ evidence: "(widget VLibras não detectado)" }];
    },
  },
];
