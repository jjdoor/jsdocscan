'use strict';

// Pure functions — no FS/process/network.

const DEFAULT_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage', 'vendor', '__pycache__']);

// ── param extraction ──────────────────────────────────────────────────────────

// Extract positional param names from a raw param string like "a, b = 1, ...rest, {x, y}"
// Returns { names: string[], hasComplex: boolean }
function parseParams(raw) {
  if (!raw || !raw.trim()) return { names: [], hasComplex: false };
  const names = [];
  let hasComplex = false;
  let depth = 0;
  let current = '';

  for (const ch of raw) {
    if ('{[(<'.includes(ch)) { depth++; current += ch; }
    else if ('}])>'.includes(ch)) { if (depth > 0) depth--; current += ch; }
    else if (ch === ',' && depth === 0) {
      processPart(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  processPart(current.trim());

  function processPart(s) {
    if (!s) return;
    if (s.startsWith('{') || s.startsWith('[')) { hasComplex = true; return; }
    s = s.replace(/^\.\.\./, '');         // rest param
    s = s.replace(/\s*=[\s\S]*$/, '');    // default value
    s = s.replace(/:.*$/, '').trim();     // TypeScript type annotation
    if (s && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s)) names.push(s);
  }

  return { names, hasComplex };
}

// Extract @param names from a JSDoc block string
function parseJsdocParams(block) {
  const names = [];
  const re = /@param(?:\s*\{[^}]*\})?\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  let m;
  while ((m = re.exec(block)) !== null) names.push(m[1]);
  return names;
}

// ── JSDoc + export finder ─────────────────────────────────────────────────────

// Walk backwards from lineIdx-1, skip blanks, return JSDoc block string if found; else null.
function findPrecedingJsdoc(lines, lineIdx) {
  let j = lineIdx - 1;
  while (j >= 0 && lines[j].trim() === '') j--;
  if (j < 0) return null;

  const endLine = lines[j].trim();
  // JSDoc ends with */
  if (!endLine.endsWith('*/') && !endLine.endsWith('* /')) return null;

  // Walk back to find /**
  let k = j;
  while (k >= 0 && !lines[k].trimStart().startsWith('/**')) k--;
  if (k < 0) return null;

  return lines.slice(k, j + 1).join('\n');
}

const EXPORT_PATTERNS = [
  // export [default] [async] function Name(params)
  /^export\s+(?:default\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)/,
  // export const/let/var Name = [async] (params) =>
  /^export\s+(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/,
  // export const/let/var Name = [async] function(params)
  /^export\s+(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?function\s*\(([^)]*)\)/,
  // export const/let/var Name = [async] function Name(params)
  /^export\s+(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?function\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(([^)]*)\)/,
];

const CLASS_PATTERN = /^export\s+(?:default\s+)?(?:abstract\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/;

// Scan a single file's content. Returns array of findings.
// finding: { line, name, kind, issue, missingParams? }
//   issue: 'missing-jsdoc' | 'undocumented-params'
//   kind: 'function' | 'class'
function scanContent(content, options = {}) {
  const { noParams = false } = options;
  const lines = content.split('\n');
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith('export')) continue;

    let name = null;
    let rawParams = null;
    let kind = 'function';

    // Try function patterns
    for (const pat of EXPORT_PATTERNS) {
      const m = trimmed.match(pat);
      if (m) { name = m[1]; rawParams = m[2]; break; }
    }

    // Try class pattern
    if (!name) {
      const cm = trimmed.match(CLASS_PATTERN);
      if (cm) { name = cm[1]; kind = 'class'; }
    }

    if (!name) continue;

    const jsdoc = findPrecedingJsdoc(lines, i);

    if (!jsdoc) {
      findings.push({ line: i + 1, name, kind, issue: 'missing-jsdoc' });
      continue;
    }

    // Check params (functions only, skip if --no-params or complex params)
    if (!noParams && rawParams !== null) {
      const { names: funcParams, hasComplex } = parseParams(rawParams);
      if (!hasComplex && funcParams.length > 0) {
        const jsdocParams = parseJsdocParams(jsdoc);
        const missing = funcParams.filter(p => !jsdocParams.includes(p));
        if (missing.length > 0) {
          findings.push({ line: i + 1, name, kind, issue: 'undocumented-params', missingParams: missing });
        }
      }
    }
  }

  return findings;
}

// Summarise findings across files: { ok, errorCount, warnCount }
// missing-jsdoc = error, undocumented-params = warn
function summarize(fileResults) {
  let errorCount = 0;
  let warnCount = 0;
  let fileCount = 0;
  let fileWithIssues = 0;
  for (const { findings } of fileResults) {
    fileCount++;
    if (findings.length > 0) fileWithIssues++;
    for (const f of findings) {
      if (f.issue === 'missing-jsdoc') errorCount++;
      else warnCount++;
    }
  }
  return { ok: errorCount === 0 && warnCount === 0, errorCount, warnCount, fileCount, fileWithIssues };
}

module.exports = { parseParams, parseJsdocParams, findPrecedingJsdoc, scanContent, summarize, DEFAULT_EXTENSIONS, SKIP_DIRS };
