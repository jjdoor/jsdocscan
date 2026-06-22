# jsdocscan

Zero-dependency CLI that finds exported functions and classes missing JSDoc — or missing `@param` tags.

```
$ npx jsdocscan src/
✗ src/utils.js:12 formatDate  missing JSDoc
! src/api.js:34 fetchUser  undocumented params: opts
jsdocscan: 2/5 files with issues — 1 error, 1 warning
```

## Install

```bash
# run without installing
npx jsdocscan

# or install globally
npm install -g jsdocscan
```

## Usage

```bash
jsdocscan [options] [paths...]
```

Scans `.js`, `.ts`, `.jsx`, `.tsx`, `.mjs`, `.cjs` files. Skips `node_modules`, `dist`, `build`, `.git`, `.next`, `coverage`, `vendor`.

### Options

| Flag | Description |
|------|-------------|
| `--ext <exts>` | Comma-separated extensions, e.g. `--ext .js,.ts` |
| `--no-params` | Skip undocumented-parameter checks |
| `--json` | Output JSON (no color) |
| `--quiet, -q` | Only print the summary line |
| `-v, --version` | Print version |
| `-h, --help` | Show help |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | All exports documented |
| `1` | Issues found (errors or warnings) |
| `2` | Usage error |

### What it checks

**Errors** (exit 1):
- `missing-jsdoc` — exported function or class has no preceding `/** … */` block

**Warnings** (exit 1):
- `undocumented-params` — JSDoc exists but one or more parameter names are missing a `@param` tag

### What it skips

- Non-exported functions and internal helpers
- Destructured params (`{a, b}`, `[x, y]`) — too many valid patterns for `@param`
- TypeScript type-only annotations when `--no-params` is set

## JSON output

```bash
jsdocscan --json src/ | jq '.[] | select(.findings | length > 0)'
```

```json
[
  {
    "file": "src/api.js",
    "findings": [
      {
        "line": 34,
        "name": "fetchUser",
        "kind": "function",
        "issue": "undocumented-params",
        "missingParams": ["opts"]
      }
    ]
  }
]
```

## License

MIT
