/**
 * Accessible name + visibility, computed statically.
 *
 * A simplified, static subset of the W3C "Accessible Name and Description
 * Computation" (accname 1.2). Every rule that asks "does this element have a
 * name?" goes through here, so the rules agree with each other.
 *
 * Static limits: CSS from stylesheets is not evaluated, so only `hidden`,
 * `aria-hidden="true"` and inline `display:none`/`visibility:hidden` count as hidden.
 */

const idIndexCache = new WeakMap();

function idIndex(root) {
  let idx = idIndexCache.get(root);
  if (!idx) {
    idx = new Map();
    for (const el of root.querySelectorAll("[id]")) {
      const id = el.getAttribute("id");
      if (!idx.has(id)) idx.set(id, el); // first occurrence wins, as in the DOM
    }
    idIndexCache.set(root, idx);
  }
  return idx;
}

const attr = (el, name) => ((el.getAttribute && el.getAttribute(name)) || "").trim();
const hasAttr = (el, name) => el.getAttribute && el.getAttribute(name) !== undefined;

const FORM_CONTROLS = new Set(["INPUT", "SELECT", "TEXTAREA", "BUTTON"]);

/** True when the element, or an ancestor, is removed from the accessibility tree. */
export function isHidden(el) {
  for (let n = el; n && n.tagName; n = n.parentNode) {
    if (hasAttr(n, "hidden")) return true;
    if (n.getAttribute("aria-hidden") === "true") return true;
    if (n.tagName === "TEMPLATE") return true;
    const style = (n.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
    if (/display:none|visibility:hidden/.test(style)) return true;
  }
  return false;
}

/** Inside a disabled <fieldset> — except its first <legend>, which HTML keeps enabled. */
function inDisabledFieldset(el) {
  for (let n = el.parentNode; n && n.tagName; n = n.parentNode) {
    if (n.tagName === "FIELDSET" && hasAttr(n, "disabled")) {
      const legend = n.childNodes.find((c) => c.tagName === "LEGEND");
      let inLegend = false;
      for (let m = el; m && m !== n; m = m.parentNode) if (m === legend) inLegend = true;
      if (!inLegend) return true;
    }
  }
  return false;
}

/**
 * Removed from the focus order by markup alone: `hidden`, `inert`, `<template>`, or inline
 * `display:none` / `visibility:hidden` on the element or an ancestor.
 */
export function outOfFocusOrder(el) {
  for (let n = el; n && n.tagName; n = n.parentNode) {
    if (hasAttr(n, "hidden") || hasAttr(n, "inert") || n.tagName === "TEMPLATE") return true;
    const style = (n.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
    if (/display:none|visibility:hidden/.test(style)) return true;
  }
  return false;
}

/** Inside a `<template>`: inert content, not part of the document. */
export function inTemplate(el) {
  for (let n = el; n && n.tagName; n = n.parentNode) if (n.tagName === "TEMPLATE") return true;
  return false;
}

/**
 * `tabindex` as browsers read it (HTML "rules for parsing integers"): leading whitespace,
 * optional sign, digits; anything after is ignored (`"2px"` → 2, `"1.5"` → 1). NaN when
 * invalid (`""`, `"abc"`) — the attribute is then ignored, not treated as 0.
 */
export function parseTabindex(value) {
  const m = /^[\t\n\f\r ]*([+-]?\d+)/.exec(value ?? "");
  return m ? parseInt(m[1], 10) : NaN;
}

/** Elements that receive keyboard focus (static view: no CSS, no scripts). */
export function isFocusable(el) {
  if (!el.tagName || hasAttr(el, "disabled") || inDisabledFieldset(el) || outOfFocusOrder(el)) return false;
  const tabindex = parseTabindex(el.getAttribute("tabindex"));
  if (tabindex < 0) return false;
  if (tabindex >= 0) return true;   // NaN (invalid value) falls through to native focusability
  if (el.tagName === "A") return hasAttr(el, "href");
  if (el.tagName === "INPUT") return attr(el, "type").toLowerCase() !== "hidden";
  return ["BUTTON", "SELECT", "TEXTAREA", "IFRAME", "SUMMARY"].includes(el.tagName);
}

/**
 * Text an element contributes to a name (accname step 2F, simplified).
 *
 * @param includeHidden  accname 2A: content of a node DIRECTLY referenced by
 *   aria-labelledby (or <label for>) counts even when that node is hidden — the
 *   documented pattern `<span id="l" hidden>Excluir</span><button aria-labelledby="l">`.
 * @param skipControls   when reading a <label>, form controls inside it are not
 *   label text: an <option>, a textarea's value or a sibling <button>'s text must not
 *   become the field's label. (Stricter than accname 2C on purpose: an audit should not
 *   accept a control's own content as its label.)
 */
function textFrom(node, { includeHidden = false, skipControls = false } = {}) {
  if (node.nodeType === 3) return node.text || ""; // TextNode.text is entity-decoded
  if (!node.tagName) return "";
  if (!includeHidden && isHidden(node)) return "";
  if (skipControls && FORM_CONTROLS.has(node.tagName)) return "";
  const label = attr(node, "aria-label");
  if (label) return label;
  if (node.tagName === "IMG") return attr(node, "alt");
  if (node.tagName === "SVG") {
    const title = node.querySelector("title");
    if (title && title.text.trim()) return title.text.trim();
    return node.querySelectorAll("text").map((t) => t.text).join(" "); // <svg><text>Entrar</text>
  }
  if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.tagName)) return "";
  return node.childNodes.map((c) => textFrom(c, { includeHidden, skipControls })).join(" ");
}

const clean = (s) => s.replace(/\s+/g, " ").trim();

/**
 * Text of a node referenced by id or <label for> (accname 2A): if the referenced node is
 * ITSELF hidden, its whole subtree counts; if it is visible, hidden descendants (an
 * `aria-hidden` asterisk, a `hidden` span) stay excluded like anywhere else.
 */
const referencedText = (node, skipControls = false) =>
  clean(textFrom(node, { includeHidden: isHidden(node), skipControls }));

/**
 * Accessible name of `el`, or "" when it has none.
 * Order follows accname: aria-labelledby → aria-label → native label → content → title.
 */
export function accessibleName(el, root) {
  const labelledby = attr(el, "aria-labelledby");
  if (labelledby) {
    const idx = idIndex(root);
    // ids that don't exist contribute nothing — a broken reference is NOT a name
    const name = clean(labelledby.split(/\s+/).map((id) => idx.get(id)).filter(Boolean)
      .map((n) => referencedText(n)).join(" "));
    if (name) return name;
  }

  const label = attr(el, "aria-label");
  if (label) return label;

  const tag = el.tagName;
  const type = attr(el, "type").toLowerCase();

  if (tag === "INPUT" && ["submit", "button", "reset"].includes(type)) {
    // value is the name; only when the attribute is ABSENT does the browser show
    // its default label — value="" renders an empty button
    if (hasAttr(el, "value")) return attr(el, "value") || attr(el, "title");
    if (type === "submit") return "Enviar";
    if (type === "reset") return "Redefinir";
    return attr(el, "title"); // <input type="button"> has no default label
  }
  if (tag === "INPUT" && type === "image") return attr(el, "alt") || attr(el, "title");

  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
    const id = attr(el, "id");
    if (id) {
      for (const l of root.querySelectorAll("label[for]")) {
        if (l.getAttribute("for") === id) {
          const name = referencedText(l, true);
          if (name) return name;
        }
      }
    }
    for (let p = el.parentNode; p && p.tagName; p = p.parentNode) {
      if (p.tagName === "LABEL") {
        // a label with `for` labels THAT control only, even if it wraps another one
        const forId = attr(p, "for");
        if (forId && forId !== id) break;
        const name = clean(textFrom(p, { skipControls: true }));
        if (name) return name;
        break;
      }
    }
  } else {
    const content = clean(el.childNodes.map((c) => textFrom(c)).join(" "));
    if (content) return content;
  }

  // title is a valid last-resort name (WCAG technique H65); placeholder deliberately is not
  return attr(el, "title");
}
