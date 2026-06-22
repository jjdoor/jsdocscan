'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseParams, parseJsdocParams, findPrecedingJsdoc, scanContent, summarize } = require('../src/core.js');

// ── parseParams ───────────────────────────────────────────────────────────────

describe('parseParams', () => {
  it('empty → no names', () => {
    assert.deepEqual(parseParams(''), { names: [], hasComplex: false });
    assert.deepEqual(parseParams('  '), { names: [], hasComplex: false });
  });
  it('simple params', () => {
    assert.deepEqual(parseParams('a, b, c'), { names: ['a', 'b', 'c'], hasComplex: false });
  });
  it('strips default values', () => {
    assert.deepEqual(parseParams('a = 1, b = "x"'), { names: ['a', 'b'], hasComplex: false });
  });
  it('strips rest prefix', () => {
    assert.deepEqual(parseParams('a, ...rest'), { names: ['a', 'rest'], hasComplex: false });
  });
  it('strips TypeScript type annotation', () => {
    assert.deepEqual(parseParams('a: string, b: number'), { names: ['a', 'b'], hasComplex: false });
  });
  it('destructured object → hasComplex=true, skipped', () => {
    const r = parseParams('{a, b}, c');
    assert.equal(r.hasComplex, true);
    assert.deepEqual(r.names, ['c']);
  });
  it('destructured array → hasComplex=true', () => {
    const r = parseParams('[x, y]');
    assert.equal(r.hasComplex, true);
  });
  it('generic type param skipped gracefully', () => {
    const r = parseParams('fn: (x: string) => void, b');
    assert.ok(r.names.includes('b'));
  });
});

// ── parseJsdocParams ──────────────────────────────────────────────────────────

describe('parseJsdocParams', () => {
  it('extracts bare @param names', () => {
    const block = '/**\n * @param a The first\n * @param b The second\n */';
    assert.deepEqual(parseJsdocParams(block), ['a', 'b']);
  });
  it('extracts typed @param names', () => {
    const block = '/**\n * @param {string} name\n * @param {number} count\n */';
    assert.deepEqual(parseJsdocParams(block), ['name', 'count']);
  });
  it('returns empty for no @param', () => {
    assert.deepEqual(parseJsdocParams('/** Just a description */'), []);
  });
  it('ignores @paramset or similar non-standard tags', () => {
    const block = '/** @paramset foo */';
    assert.deepEqual(parseJsdocParams(block), []);
  });
});

// ── findPrecedingJsdoc ────────────────────────────────────────────────────────

describe('findPrecedingJsdoc', () => {
  it('finds JSDoc immediately before', () => {
    const lines = ['/**', ' * foo', ' */', 'export function foo() {}'];
    const result = findPrecedingJsdoc(lines, 3);
    assert.ok(result != null);
    assert.ok(result.includes('foo'));
  });
  it('finds JSDoc with blank line between', () => {
    const lines = ['/**', ' */', '', 'export function foo() {}'];
    assert.ok(findPrecedingJsdoc(lines, 3) != null);
  });
  it('returns null when no JSDoc precedes', () => {
    const lines = ['// just a comment', 'export function foo() {}'];
    assert.equal(findPrecedingJsdoc(lines, 1), null);
  });
  it('returns null when only code precedes', () => {
    const lines = ['const x = 1;', 'export function foo() {}'];
    assert.equal(findPrecedingJsdoc(lines, 1), null);
  });
  it('returns null at line 0', () => {
    assert.equal(findPrecedingJsdoc(['export function foo() {}'], 0), null);
  });
});

// ── scanContent ───────────────────────────────────────────────────────────────

describe('scanContent', () => {
  function mkJsdoc(params = []) {
    const paramLines = params.map(p => ` * @param ${p} desc`).join('\n');
    return `/**\n${paramLines}\n */`;
  }

  it('clean file → no findings', () => {
    const content = `${mkJsdoc(['a', 'b'])}\nexport function foo(a, b) {}`;
    assert.deepEqual(scanContent(content), []);
  });

  it('missing JSDoc → missing-jsdoc error', () => {
    const content = `export function foo(a) {}`;
    const r = scanContent(content);
    assert.equal(r.length, 1);
    assert.equal(r[0].issue, 'missing-jsdoc');
    assert.equal(r[0].name, 'foo');
    assert.equal(r[0].line, 1);
  });

  it('undocumented param → undocumented-params warn', () => {
    const content = `/** @param a desc */\nexport function foo(a, b) {}`;
    const r = scanContent(content);
    assert.equal(r.length, 1);
    assert.equal(r[0].issue, 'undocumented-params');
    assert.deepEqual(r[0].missingParams, ['b']);
  });

  it('all params documented → no findings', () => {
    const content = `/** @param a desc\n * @param b desc */\nexport function foo(a, b) {}`;
    assert.deepEqual(scanContent(content), []);
  });

  it('export const arrow function', () => {
    const content = `export const bar = (x, y) => x + y;`;
    const r = scanContent(content);
    assert.equal(r[0].issue, 'missing-jsdoc');
    assert.equal(r[0].name, 'bar');
  });

  it('export const function expression', () => {
    const content = `export const baz = function(x) { return x; };`;
    const r = scanContent(content);
    assert.equal(r[0].issue, 'missing-jsdoc');
    assert.equal(r[0].name, 'baz');
  });

  it('export class → missing-jsdoc with kind=class', () => {
    const content = `export class MyClass {}`;
    const r = scanContent(content);
    assert.equal(r[0].issue, 'missing-jsdoc');
    assert.equal(r[0].kind, 'class');
  });

  it('export class with JSDoc → no findings', () => {
    const content = `/** My class */\nexport class MyClass {}`;
    assert.deepEqual(scanContent(content), []);
  });

  it('async function', () => {
    const content = `export async function fetchData(url, opts) {}`;
    const r = scanContent(content);
    assert.equal(r[0].issue, 'missing-jsdoc');
    assert.equal(r[0].name, 'fetchData');
  });

  it('no-params option skips param checks', () => {
    const content = `/** @param a */\nexport function foo(a, b) {}`;
    const r = scanContent(content, { noParams: true });
    assert.deepEqual(r, []);
  });

  it('zero-param function with JSDoc → no findings', () => {
    const content = `/** Gets time */\nexport function now() { return Date.now(); }`;
    assert.deepEqual(scanContent(content), []);
  });

  it('complex destructured params skipped for param check', () => {
    const content = `/** @param opts */\nexport function foo({ a, b }) {}`;
    assert.deepEqual(scanContent(content), []);
  });

  it('rest param extracted and checked', () => {
    const content = `/** @param a */\nexport function foo(a, ...args) {}`;
    const r = scanContent(content);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].missingParams, ['args']);
  });

  it('default values stripped from param name', () => {
    const content = `/** @param a */\nexport function foo(a, b = 10) {}`;
    const r = scanContent(content);
    assert.deepEqual(r[0].missingParams, ['b']);
  });

  it('non-export function ignored', () => {
    const content = `function internal(x) {}\nexport function pub(x) {}`;
    const r = scanContent(content);
    assert.equal(r.length, 1);
    assert.equal(r[0].name, 'pub');
  });

  it('multiple exports in one file', () => {
    const content = [
      '/** @param a */',
      'export function foo(a) {}',
      'export function bar(b) {}',
      '/** @param x */',
      'export const baz = (x) => x;',
    ].join('\n');
    const r = scanContent(content);
    assert.equal(r.length, 1);
    assert.equal(r[0].name, 'bar');
  });

  it('TypeScript type annotation on param', () => {
    const content = `/** @param name @param count */\nexport function greet(name: string, count: number) {}`;
    assert.deepEqual(scanContent(content), []);
  });
});

// ── summarize ─────────────────────────────────────────────────────────────────

describe('summarize', () => {
  it('no findings → ok=true', () => {
    const r = summarize([{ findings: [] }, { findings: [] }]);
    assert.equal(r.ok, true);
    assert.equal(r.errorCount, 0);
    assert.equal(r.warnCount, 0);
  });

  it('missing-jsdoc → errorCount++', () => {
    const r = summarize([{ findings: [{ issue: 'missing-jsdoc' }] }]);
    assert.equal(r.ok, false);
    assert.equal(r.errorCount, 1);
    assert.equal(r.warnCount, 0);
  });

  it('undocumented-params → warnCount++', () => {
    const r = summarize([{ findings: [{ issue: 'undocumented-params', missingParams: ['b'] }] }]);
    assert.equal(r.ok, false);
    assert.equal(r.warnCount, 1);
    assert.equal(r.errorCount, 0);
  });

  it('counts fileWithIssues correctly', () => {
    const r = summarize([
      { findings: [{ issue: 'missing-jsdoc' }] },
      { findings: [] },
    ]);
    assert.equal(r.fileWithIssues, 1);
    assert.equal(r.fileCount, 2);
  });
});
