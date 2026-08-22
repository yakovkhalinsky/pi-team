#!/usr/bin/env node
// Build pi-agents-team from TypeScript sources to dist/.
// The TS sources are pure JS emitted by the original compile, so this script
// performs a structural copy: .ts -> .js and .d.ts -> .d.ts, preserving
// relative ESM import specifiers. Static assets (prompts/, profiles/) are
// copied unchanged.
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const srcDir = join(root, "src");
const distDir = join(root, "dist");
const assetDirs = ["profiles", "prompts"];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyRecursive(source, target, transform) {
  const entries = await readdir(source, { withFileTypes: true });
  await mkdir(target, { recursive: true });
  for (const entry of entries) {
    const srcPath = join(source, entry.name);
    const destPath = join(target, entry.name);
    if (entry.isDirectory()) {
      await copyRecursive(srcPath, destPath, transform);
    } else if (entry.isFile()) {
      const content = await readFile(srcPath);
      const out = transform ? transform(entry.name, content) : content;
      await mkdir(dirname(destPath), { recursive: true });
      await writeFile(destPath, out);
    }
  }
}

async function main() {
  // Clean previous dist.
  if (await exists(distDir)) {
    await rm(distDir, { recursive: true, force: true });
  }

  // Copy source files with extension translation.
  await copyRecursive(srcDir, distDir, (name, content) => {
    if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
      return content;
    }
    if (name.endsWith(".d.ts")) {
      return content;
    }
    return content;
  });

  // Rename .ts files to .js in dist.
  await renameTsToJs(distDir);

  // Copy static assets.
  for (const asset of assetDirs) {
    const source = join(root, asset);
    if (await exists(source)) {
      await copyRecursive(source, join(distDir, asset), null);
    }
  }

  const stats = await summarizeDist();
  console.log(`Built ${relative(root, distDir)}: ${stats.files} file(s), ${stats.dts} declaration(s)`);
}

async function renameTsToJs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await renameTsToJs(srcPath);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      const destPath = join(dir, entry.name.replace(/\.ts$/, ".js"));
      await writeFile(destPath, await readFile(srcPath));
      await rm(srcPath);
    }
  }
}

async function summarizeDist() {
  let files = 0;
  let dts = 0;
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(p);
      } else {
        files += 1;
        if (entry.name.endsWith(".d.ts")) dts += 1;
      }
    }
  }
  await walk(distDir);
  return { files, dts };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
