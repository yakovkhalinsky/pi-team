#!/usr/bin/env node
// Lightweight typecheck stand-in for the ported package: validates that every
// emitted .js file in dist/ parses cleanly with Node and that the expected
// .d.ts declarations are present.
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}

function checkFile(path) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ["--check", path], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function main() {
  const files = [];
  for await (const path of walk(dist)) {
    files.push(path);
  }
  const jsFiles = files.filter((p) => extname(p) === ".js");
  const dtsFiles = files.filter((p) => p.endsWith(".d.ts"));
  if (jsFiles.length === 0) {
    throw new Error("No .js files found in dist/; run npm run build first");
  }
  for (const file of jsFiles) {
    await checkFile(file);
  }
  console.log(`Syntax check passed for ${jsFiles.length} .js file(s); ${dtsFiles.length} .d.ts declaration(s) present.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
