#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { scanContent, summarize, DEFAULT_EXTENSIONS, SKIP_DIRS } = require('../src/core.js');

const VERSION = '0.1.0';
const HELP = `
jsdocscan — find exported functions / classes missing JSDoc

Usage:
  jsdocscan [options] [paths...]

Arguments:
  paths         Files or directories to scan (default: .)

Options:
  --ext <exts>  Comma-separated extensions to scan (default: .js,.ts,.jsx,.tsx,.mjs,.cjs)
  --no-params   Skip undocumented-parameter checks
  --json        Output JSON (no color)
  --quiet, -q   Only print summary line
  -v, --version Print version
  -h, --help    Show this help
`.trim();

const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';

function colorize(s, c) { return process.stdout.isTTY ? c + s + RESET : s; }

function parseArgs(argv) {
  const args = { paths: [], ext: null, noParams: false, json: false, quiet: false };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    if (a === '-v' || a === '--version') { console.log(VERSION); process.exit(0); }
    if (a === '--no-params') { args.noParams = true; }
    else if (a === '--json') { args.json = true; }
    else if (a === '--quiet' || a === '-q') { args.quiet = true; }
    else if (a === '--ext') {
      i++;
      if (!argv[i]) { console.error('--ext requires a value'); process.exit(2); }
      args.ext = new Set(argv[i].split(',').map(e => e.trim().replace(/^\.?/, '.')));
    } else if (!a.startsWith('-')) {
      args.paths.push(a);
    } else {
      console.error(`Unknown option: ${a}`);
      process.exit(2);
    }
    i++;
  }
  return args;
}

function collectFiles(target, extensions, results = []) {
  let stat;
  try { stat = fs.statSync(target); } catch { return results; }
  if (stat.isFile()) {
    const ext = path.extname(target);
    if (extensions.has(ext)) results.push(target);
    return results;
  }
  if (!stat.isDirectory()) return results;
  let entries;
  try { entries = fs.readdirSync(target); } catch { return results; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    collectFiles(path.join(target, e), extensions, results);
  }
  return results;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const extensions = args.ext || DEFAULT_EXTENSIONS;
  const scanPaths = args.paths.length ? args.paths : ['.'];

  const files = [];
  for (const p of scanPaths) collectFiles(p, extensions, files);

  if (files.length === 0) {
    if (!args.json) console.log(colorize('No files found.', DIM));
    process.exit(0);
  }

  const fileResults = [];
  for (const file of files) {
    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const findings = scanContent(content, { noParams: args.noParams });
    fileResults.push({ file, findings });
  }

  if (args.json) {
    console.log(JSON.stringify(fileResults, null, 2));
    const { ok } = summarize(fileResults);
    process.exit(ok ? 0 : 1);
    return;
  }

  if (!args.quiet) {
    for (const { file, findings } of fileResults) {
      for (const f of findings) {
        const rel = path.relative(process.cwd(), file);
        if (f.issue === 'missing-jsdoc') {
          console.log(
            `${colorize('✗', RED)} ${colorize(rel, DIM)}:${f.line} ${colorize(f.name, RED)}` +
            `  ${colorize('missing JSDoc', RED)}`
          );
        } else {
          console.log(
            `${colorize('!', YELLOW)} ${colorize(rel, DIM)}:${f.line} ${colorize(f.name, YELLOW)}` +
            `  ${colorize('undocumented params:', YELLOW)} ${f.missingParams.join(', ')}`
          );
        }
      }
    }
  }

  const { ok, errorCount, warnCount, fileCount, fileWithIssues } = summarize(fileResults);

  if (ok) {
    console.log(colorize(`jsdocscan: ${fileCount} file${fileCount !== 1 ? 's' : ''} scanned — all clean`, GREEN));
  } else {
    const parts = [];
    if (errorCount > 0) parts.push(colorize(`${errorCount} error${errorCount !== 1 ? 's' : ''}`, RED));
    if (warnCount  > 0) parts.push(colorize(`${warnCount} warning${warnCount !== 1 ? 's' : ''}`, YELLOW));
    console.log(
      `jsdocscan: ${colorize(`${fileWithIssues}/${fileCount}`, YELLOW)} file${fileCount !== 1 ? 's' : ''} with issues — ${parts.join(', ')}`
    );
  }

  process.exit(ok ? 0 : 1);
}

main();
