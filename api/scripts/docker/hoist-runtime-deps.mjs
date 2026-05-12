import fs from 'node:fs';
import path from 'node:path';

const nodeModulesRoot = process.argv[2];

if (!nodeModulesRoot) {
  throw new Error(
    'Usage: node scripts/docker/hoist-runtime-deps.mjs <node_modules_root>',
  );
}

const pnpmRoot = path.join(nodeModulesRoot, '.pnpm');

if (!fs.existsSync(pnpmRoot)) {
  throw new Error(`pnpm store not found: ${pnpmRoot}`);
}

for (const entry of fs.readdirSync(pnpmRoot)) {
  if (!entry.startsWith('@lumimax+')) {
    continue;
  }

  const depsRoot = path.join(pnpmRoot, entry, 'node_modules');
  if (!fs.existsSync(depsRoot)) {
    continue;
  }

  for (const item of fs.readdirSync(depsRoot)) {
    if (item === '.bin' || item === '@lumimax') {
      continue;
    }

    if (item.startsWith('@')) {
      hoistScopedDeps(nodeModulesRoot, depsRoot, item);
      continue;
    }

    hoistDep(nodeModulesRoot, item, path.join(depsRoot, item));
  }
}

function hoistScopedDeps(nodeModulesRoot, depsRoot, scopeName) {
  const scopeDir = path.join(depsRoot, scopeName);
  if (!fs.existsSync(scopeDir)) {
    return;
  }

  for (const pkgName of fs.readdirSync(scopeDir)) {
    hoistDep(
      nodeModulesRoot,
      `${scopeName}/${pkgName}`,
      path.join(scopeDir, pkgName),
    );
  }
}

function hoistDep(nodeModulesRoot, packageName, resolvedPath) {
  const destination = path.join(nodeModulesRoot, ...packageName.split('/'));
  if (fs.existsSync(destination)) {
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const fromDir = path.dirname(destination);
  const relativeTarget = path.relative(fromDir, resolvedPath);
  fs.symlinkSync(relativeTarget, destination);
}
