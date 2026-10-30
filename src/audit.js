/** Audit engine: parse HTML once, run every rule, return a structured result. */
import { parse } from "node-html-parser";
import { rules } from "./rules.js";

/**
 * Heuristic: the HTML is an empty shell filled in by JavaScript (React/Vue/Angular SPA).
 * Static analysis of such a page audits the shell, not the content the user sees — the
 * report must say so instead of presenting "no <h1>" as a real barrier.
 */
export function looksLikeJsShell(root) {
  const body = root.querySelector("body") || root;
  const clone = body.clone();
  for (const el of clone.querySelectorAll("script, style, noscript, template")) el.remove();
  const visibleText = clone.text.replace(/\s+/g, "").length;
  const scripts = root.querySelectorAll("script[src]").length + root.querySelectorAll('script[type="module"]').length;
  return visibleText < 80 && scripts > 0;
}

/**
 * @param {string} html   raw HTML
 * @param {object} [opts] { source?: string, isBrazilContext?: boolean }
 * @returns {{source:string, passed:Array, failed:Array, counts:{erro:number,aviso:number,info:number}, jsShell:boolean}}
 */
export function audit(html, opts = {}) {
  const root = parse(html, { comment: false });
  const ctx = {
    source: opts.source || "(html)",
    isBrazilContext: opts.isBrazilContext !== false,
  };

  const passed = [];
  const failed = [];
  for (const rule of rules) {
    const findings = rule.check(root, ctx);
    if (findings.length === 0) {
      passed.push({ id: rule.id, title: rule.title, severity: rule.severity, norms: rule.norms });
    } else {
      failed.push({ id: rule.id, title: rule.title, severity: rule.severity, norms: rule.norms, fix: rule.fix, findings });
    }
  }

  const counts = { erro: 0, aviso: 0, info: 0 };
  for (const f of failed) counts[f.severity] += 1;

  return { source: ctx.source, passed, failed, counts, jsShell: looksLikeJsShell(root) };
}
