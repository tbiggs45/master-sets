#!/usr/bin/env node
/**
 * Compiles src/index.html (JSX source) → MasterSets/MasterSets/index.html (plain JS).
 * Run: cd scripts && npm run build
 *
 * What this does:
 *   1. Removes the Babel Standalone CDN <script> tag
 *   2. Finds the <script type="text/babel"> block
 *   3. Compiles its JSX content with @babel/preset-react (classic runtime)
 *   4. Replaces the block with a plain <script> containing the compiled output
 */

const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const srcPath = path.resolve(__dirname, "../src/index.html");
const outPath = path.resolve(__dirname, "../MasterSets/MasterSets/index.html");

const html = fs.readFileSync(srcPath, "utf8");

// 1. Strip the Babel Standalone CDN tag (with or without surrounding whitespace/newline)
let output = html.replace(
  /[ \t]*<script\s+src="https:\/\/unpkg\.com\/@babel\/standalone\/babel\.min\.js"[^>]*><\/script>\n?/,
  ""
);

// 2. Locate the <script type="text/babel" …> … </script> block
const BABEL_BLOCK_RE = /(<script\s[^>]*type="text\/babel"[^>]*>)([\s\S]*?)(<\/script>)/;
const match = BABEL_BLOCK_RE.exec(output);
if (!match) {
  console.error("ERROR: Could not find <script type=\"text/babel\"> block in src/index.html");
  process.exit(1);
}

const jsxSource = match[2];

// 3. Compile JSX → plain JS (no module transform; app uses global React)
let compiled;
try {
  const result = babel.transformSync(jsxSource, {
    presets: [["@babel/preset-react", { runtime: "classic" }]],
    filename: "app.jsx",
    sourceMaps: false,
    compact: false,
  });
  compiled = result.code;
} catch (err) {
  console.error("Babel compilation failed:\n", err.message);
  process.exit(1);
}

// 4. Replace the babel block with plain <script>
output = output.replace(match[0], `<script>\n${compiled}\n  </script>`);

fs.writeFileSync(outPath, output, "utf8");
console.log(`Built: ${outPath}`);
