/**
 * Accessible name + visibility, computed statically.
 *
 * A simplified, static subset of the W3C "Accessible Name and Description
 * Computation" (accname 1.2). Every rule that asks "does this element have a
 * name?" goes through here, so the rules agree with each other — before this
 * module each rule had its own partial notion of "name", which produced both
 * false negatives (broken aria-labelledby passed) and false positives
 * (<svg aria-label> icon links and <input title> were flagged).
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

/** True when the element, or an ancestor, is removed from the accessibility tree. */
export function isHidden(el) {
  for (let n = el; n && n.tagName; n = n.parentNode) {
    if (n.getAttribute("hidden") !== undefined) return true;
    if (n.getAttribute("aria-hidden") === "true") return true;
    if (n.tagName === "TEMPLATE") return true;
    const style = (n.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
    if (/display:none|visibility:hidden/.test(style)) return true;
  }
  return false;
}

/** Text an element contributes to the name of an ancestor (accname step 2F, simplified). */
function textFrom(node) {
  if (node.nodeType === 3) return node.text || ""; // TextNode.text is entity-decoded
  if (!node.tagName || isHidden(node)) return "";
  const label = attr(node, "aria-label");
  if (label) return label;
  if (node.tagName === "IMG") return attr(node, "alt");
  if (node.tagName === "SVG") {
    const title = node.querySelector("title");
    return title ? title.text.trim() : "";
  }
  if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.tagName)) return "";
  return node.childNodes.map(textFrom).join(" ");
}

const clean = (s) => s.replace(/\s+/g, " ").trim();

/**
 * Accessible name of `el`, or "" when it has none.
 * Order follows accname: aria-labelledby → aria-label → native label → content → title.
 */
export function accessibleName(el, root) {
  const labelledby = attr(el, "aria-labelledby");
  if (labelledby) {
    const idx = idIndex(root);
    // ids that don't exist contribute nothing — a broken reference is NOT a name
    const name = clean(labelledby.split(/\s+/).map((id) => idx.get(id)).filter(Boolean).map(textFrom).join(" "));
    if (name) return name;
  }

  const label = attr(el, "aria-label");
  if (label) return label;

  const tag = el.tagName;
  const type = attr(el, "type").toLowerCase();

  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
    const id = attr(el, "id");
    if (id) {
      for (const l of root.querySelectorAll("label[for]")) {
        if (l.getAttribute("for") === id) {
          const name = clean(textFrom(l));
          if (name) return name;
        }
      }
    }
    for (let p = el.parentNode; p && p.tagName; p = p.parentNode) {
      if (p.tagName === "LABEL") {
        const name = clean(textFrom(p));
        if (name) return name;
        break;
      }
    }
    if (tag === "INPUT" && ["submit", "button", "reset"].includes(type)) {
      const v = attr(el, "value");
      if (v) return v;
      if (type !== "button") return type === "submit" ? "Enviar" : "Redefinir"; // browser default
    }
    if (tag === "INPUT" && type === "image") {
      const alt = attr(el, "alt");
      if (alt) return alt;
    }
  } else {
    const content = clean(el.childNodes.map(textFrom).join(" "));
    if (content) return content;
  }

  // title is a valid last-resort name (WCAG technique H65); placeholder deliberately is not
  return attr(el, "title");
}
