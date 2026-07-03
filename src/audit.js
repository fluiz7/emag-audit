/** Audit engine: parse HTML once, run every rule, return a structured result. */
import { parse } from "node-html-parser";
import { rules } from "./rules.js";

/**
 * @param {string} html   raw HTML
 * @param {object} [opts] { source?: string, isBrazilContext?: boolean }
 * @returns {{source:string, passed:Array, failed:Array, counts:{erro:number,aviso:number,info:number}}}
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

  return { source: ctx.source, passed, failed, counts };
}
