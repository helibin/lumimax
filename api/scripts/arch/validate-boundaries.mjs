import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const baseServiceSrc = path.join(rootDir, 'apps/base-service/src');
const bizServiceSrc = path.join(rootDir, 'apps/biz-service/src');
const gatewayAppModule = path.join(rootDir, 'apps/gateway/src/app.module.ts');
const baseEntityFile = path.join(rootDir, 'libs/database/src/base.entity.ts');

const baseForbiddenTokens = [
  'biz-service',
  'biz.proto',
  'BIZ_PROTO_PACKAGE',
  'BIZ_BASE_SERVICE_GRPC_CLIENT',
];

async function main() {
  const failures = [];
  const baseFiles = await listFiles(baseServiceSrc);
  const bizFiles = await listFiles(bizServiceSrc);

  for (const file of baseFiles) {
    const content = await readFile(file, 'utf8');
    for (const token of baseForbiddenTokens) {
      if (content.includes(token)) {
        failures.push(`base-service 发现反向依赖 token "${token}": ${relative(file)}`);
      }
    }
  }

  const routePrefixFailures = await checkPublicRoutePrefixes(baseFiles, 'base-service');
  failures.push(...routePrefixFailures);
  const bizRoutePrefixFailures = await checkPublicRoutePrefixes(bizFiles, 'biz-service');
  failures.push(...bizRoutePrefixFailures);

  const gatewayAppModuleContent = await readFile(gatewayAppModule, 'utf8');
  if (!gatewayAppModuleContent.includes('RequestIdMiddleware')) {
    failures.push('gateway app.module 缺少 RequestIdMiddleware');
  }
  if (!gatewayAppModuleContent.includes('GatewayRateLimitMiddleware')) {
    failures.push('gateway app.module 缺少 GatewayRateLimitMiddleware');
  }

  const baseEntityContent = await readFile(baseEntityFile, 'utf8');
  if (!baseEntityContent.includes("length: 32")) {
    failures.push('BaseEntity 主键长度不是 32');
  }
  if (!baseEntityContent.includes('@BeforeInsert()')) {
    failures.push('BaseEntity 缺少 BeforeInsert 自动生成逻辑');
  }

  if (failures.length > 0) {
    console.error('Architecture boundary checks failed:\n');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('Architecture boundary checks passed.');
}

async function checkPublicRoutePrefixes(files, serviceName) {
  const failures = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (!content.includes('@Controller(')) {
      continue;
    }
    const controllerMatches = content.match(/@Controller\(([^)]*)\)/g) ?? [];
    for (const controllerDecorator of controllerMatches) {
      if (
        controllerDecorator.includes("'api/") ||
        controllerDecorator.includes('"api/') ||
        controllerDecorator.includes("'/api") ||
        controllerDecorator.includes('"/api')
      ) {
        failures.push(`${serviceName} 存在对外 API 前缀 controller: ${relative(file)}`);
      }
    }
  }
  return failures;
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(fullPath);
    }
  }
  return files;
}

function relative(filePath) {
  return path.relative(rootDir, filePath);
}

void main();
