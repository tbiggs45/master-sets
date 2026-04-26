#!/usr/bin/env node
/**
 * Build script: transpiles JSX in src/index.html and writes compiled output
 * to MasterSets/MasterSets/index.html (removing the Babel Standalone CDN dep).
 *
 * Usage: cd scripts && npm run build
 */

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const SRC = path.resolve(__dirname, '../src/index.html');
const OUT = path.resolve(__dirname, '../MasterSets/MasterSets/index.html');

let html = fs.readFileSync(SRC, 'utf8');

// 1. Remove the Babel Standalone <script> tag
html = html.replace(
  /[ \t]*<script[^>]*unpkg\.com\/@babel\/standalone[^>]*><\/script>\n?/,
  ''
);

// 2. Find the <script type="text/babel" ...> block
const babelScriptRe = /<script\s[^>]*type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
const match = html.match(babelScriptRe);
if (!match) {
  console.error('ERROR: Could not find <script type="text/babel"> in src/index.html');
  process.exit(1);
}

const jsxSource = match[1];

// 3. Transpile JSX → plain JS
const result = babel.transformSync(jsxSource, {
  presets: ['@babel/preset-react'],
  compact: false,
});

if (!result || !result.code) {
  console.error('ERROR: Babel transpilation failed.');
  process.exit(1);
}

// 4. Replace the babel script tag with a plain <script> tag
html = html.replace(
  babelScriptRe,
  `<script>\n${result.code}\n</script>`
);

// 5. Write output
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');

console.log(`Built: ${OUT}`);
