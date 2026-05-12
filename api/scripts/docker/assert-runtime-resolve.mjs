#!/usr/bin/env node
/**
 * Docker 镜像构建阶段：校验各服务 package.json 的 **dependencies**
 * 在 **apps/<app>/node_modules** 下均有对应目录（或符号链接）。
 *
 * 为何不用 require()：
 * pnpm 把依赖挂在 apps/<app>/node_modules；但 workspace 包 package.json 的 main 可能与
 * tsc 输出路径不一致，require() 会在「安装正确」的情况下仍报错，不适合做镜像完整性门闸。
 *
 * 用法（api 仓库根目录）：
 *   node scripts/docker/assert-runtime-resolve.mjs
 *   node scripts/docker/assert-runtime-resolve.mjs /workspace/api
 */

import { existsSync, readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ? process.argv[2].replace(/\/$/, '') : process.cwd();

const apps = process.argv[3]
  ? process.argv[3].split(',').map((s) => s.trim())
  : ['gateway', 'base-service', 'biz-service'];

for (const app of apps) {
  const mainJs = join(root, 'dist/apps', app, 'src/main.js');
  if (!existsSync(mainJs)) {
    console.error(`[assert-runtime-resolve] missing entry: ${mainJs}`);
    process.exit(1);
  }

  const appPkgJson = join(root, 'apps', app, 'package.json');
  if (!existsSync(appPkgJson)) {
    console.error(`[assert-runtime-resolve] missing package.json: ${appPkgJson}`);
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(appPkgJson, 'utf8'));
  const deps = pkg.dependencies || {};
  const names = Object.keys(deps);

  const nmRoot = join(root, 'apps', app, 'node_modules');

  console.log(`[assert-runtime-resolve] ${app}: checking ${names.length} dependency paths...`);

  for (const name of names) {
    const segments = name.startsWith('@') ? name.split('/') : [name];
    if (name.startsWith('@') && segments.length !== 2) {
      console.error(`[assert-runtime-resolve] bad scoped name: ${name}`);
      process.exit(1);
    }
    const depPath = join(nmRoot, ...segments);

    if (!existsSync(depPath)) {
      console.error(`[assert-runtime-resolve] FAILED ${app} → missing ${depPath}`);
      process.exit(1);
    }

    try {
      const st = lstatSync(depPath);
      if (!st.isDirectory() && !st.isSymbolicLink()) {
        console.error(`[assert-runtime-resolve] FAILED ${app} → not dir/link: ${depPath}`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`[assert-runtime-resolve] FAILED ${app} → ${depPath}`);
      console.error(err);
      process.exit(1);
    }

    const pkgJsonPath = join(depPath, 'package.json');
    if (!existsSync(pkgJsonPath)) {
      console.error(
        `[assert-runtime-resolve] FAILED ${app} → no package.json under dependency: ${name}`,
      );
      process.exit(1);
    }
  }

  console.log(`[assert-runtime-resolve] ${app}: OK`);
}
