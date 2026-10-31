/**
 * HTML loading for the CLI: local file or URL.
 *
 * - Timeout: a slow or hanging server must not freeze the CLI (or a CI job) forever.
 * - Charset: many .gov.br and older university pages are still served as ISO-8859-1 /
 *   windows-1252. `response.text()` always decodes as UTF-8, which garbles accented
 *   evidence in the report ("Cotação" -> "Cota��o"). Decode with the declared charset:
 *   HTTP Content-Type first, then <meta charset> / http-equiv in the first bytes, else UTF-8.
 */
import { readFile } from "node:fs/promises";

export const DEFAULT_TIMEOUT_MS = 20_000;

function charsetFromContentType(ct) {
  const m = /charset\s*=\s*["']?([\w.:-]+)/i.exec(ct || "");
  return m ? m[1].toLowerCase() : null;
}

function charsetFromMeta(bytes) {
  // meta tags must appear in the first 1024 bytes (HTML spec); read them as latin1, which never fails
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  const m = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head);
  return m ? m[1].toLowerCase() : null;
}

/** Decode raw HTML bytes using the declared charset; unknown labels fall back to UTF-8. */
export function decodeHtml(bytes, contentType = "") {
  const label = charsetFromContentType(contentType) || charsetFromMeta(bytes) || "utf-8";
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export async function loadHtml(target, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (/^https?:\/\//i.test(target)) {
    // the signal covers the WHOLE exchange: a server can answer headers quickly and then
    // stall while streaming the body, so reading the body must sit inside the same handler
    try {
      const res = await fetch(target, {
        headers: { "User-Agent": "emag-audit/0.2 (+https://github.com/fluiz7/emag-audit)" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${target}`);
      return decodeHtml(new Uint8Array(await res.arrayBuffer()), res.headers.get("content-type"));
    } catch (e) {
      if (e.name === "TimeoutError") throw new Error(`tempo esgotado (${timeoutMs / 1000}s) ao buscar ${target}`);
      throw e;
    }
  }
  return decodeHtml(new Uint8Array(await readFile(target)));
}
