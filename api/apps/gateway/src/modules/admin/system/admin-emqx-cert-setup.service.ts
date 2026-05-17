import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';

const execFileAsync = promisify(execFile);

interface CertFileState {
  exists: boolean;
  name: string;
  path: string;
}

export interface EmqxBootstrapCertStatus {
  certDir: string;
  files: CertFileState[];
  ready: boolean;
  warnings: string[];
  writable: boolean;
}

@Injectable()
export class AdminEmqxCertSetupService {
  async getStatus(): Promise<EmqxBootstrapCertStatus> {
    const layout = this.resolveLayout();
    const files = await Promise.all([
      this.toFileState('ca.crt', layout.caCrtPath),
      this.toFileState('ca.key', layout.caKeyPath),
      this.toFileState('server.crt', layout.serverCrtPath),
      this.toFileState('server.key', layout.serverKeyPath),
      this.toFileState('iot-service.crt', layout.iotServiceCrtPath),
      this.toFileState('iot-service.key', layout.iotServiceKeyPath),
    ]);
    const warnings: string[] = [];
    const writable = await this.isDirWritable(layout.certDir);

    if (!writable) {
      warnings.push(`证书目录不可写：${layout.certDir}`);
    }

    const missing = files.filter((item) => !item.exists).map((item) => item.name);
    if (missing.length > 0) {
      warnings.push(`缺少证书文件：${missing.join(', ')}`);
    }

    return {
      certDir: layout.certDir,
      files,
      ready: missing.length === 0,
      warnings,
      writable,
    };
  }

  async setup(): Promise<EmqxBootstrapCertStatus> {
    const layout = this.resolveLayout();
    await Promise.all([
      fs.mkdir(layout.certDir, { recursive: true }),
      fs.mkdir(path.dirname(layout.caKeyPath), { recursive: true }),
      fs.mkdir(path.dirname(layout.iotServiceCrtPath), { recursive: true }),
      fs.mkdir(path.dirname(layout.iotServiceKeyPath), { recursive: true }),
    ]);
    await this.ensureWritable(layout.certDir);
    await this.ensureCa(layout);
    await this.ensureServerCert(layout);
    await this.ensureIotServiceCert(layout);
    return this.getStatus();
  }

  private async ensureCa(layout: ReturnType<AdminEmqxCertSetupService['resolveLayout']>): Promise<void> {
    if (await this.pathExists(layout.caCrtPath) && await this.pathExists(layout.caKeyPath)) {
      return;
    }
    await this.runOpenSsl(['genrsa', '-out', layout.caKeyPath, '4096']);
    await this.runOpenSsl([
      'req',
      '-x509',
      '-new',
      '-nodes',
      '-key',
      layout.caKeyPath,
      '-sha256',
      '-days',
      String(layout.caDays),
      '-out',
      layout.caCrtPath,
      '-subj',
      `/CN=${layout.caName}/O=Lumimax`,
    ]);
  }

  private async ensureServerCert(layout: ReturnType<AdminEmqxCertSetupService['resolveLayout']>): Promise<void> {
    if (await this.pathExists(layout.serverCrtPath) && await this.pathExists(layout.serverKeyPath)) {
      return;
    }
    const extPath = path.join(
      os.tmpdir(),
      `lumimax-emqx-server-${process.pid}-${Date.now()}.ext`,
    );
    try {
      await fs.writeFile(
        extPath,
        [
          'authorityKeyIdentifier=keyid,issuer',
          'basicConstraints=CA:FALSE',
          'keyUsage=digitalSignature,keyEncipherment',
          'extendedKeyUsage=serverAuth',
          `subjectAltName=${layout.serverSans}`,
          '',
        ].join('\n'),
        'utf8',
      );
      await this.issueLeaf({
        crtPath: layout.serverCrtPath,
        csrPath: layout.serverCsrPath,
        days: layout.leafDays,
        extPath,
        keyPath: layout.serverKeyPath,
        layout,
        subject: `/CN=${layout.serverCn}/O=${layout.serverOrg}`,
      });
    } finally {
      await fs.rm(extPath, { force: true });
    }
  }

  private async ensureIotServiceCert(layout: ReturnType<AdminEmqxCertSetupService['resolveLayout']>): Promise<void> {
    if (await this.pathExists(layout.iotServiceCrtPath) && await this.pathExists(layout.iotServiceKeyPath)) {
      return;
    }
    const extPath = path.join(
      os.tmpdir(),
      `lumimax-emqx-client-${process.pid}-${Date.now()}.ext`,
    );
    try {
      await fs.writeFile(
        extPath,
        [
          'authorityKeyIdentifier=keyid,issuer',
          'basicConstraints=CA:FALSE',
          'keyUsage=digitalSignature,keyEncipherment',
          'extendedKeyUsage=clientAuth',
          '',
        ].join('\n'),
        'utf8',
      );
      await this.issueLeaf({
        crtPath: layout.iotServiceCrtPath,
        csrPath: layout.iotServiceCsrPath,
        days: layout.leafDays,
        extPath,
        keyPath: layout.iotServiceKeyPath,
        layout,
        subject: `/CN=${layout.iotServiceCn}/OU=internal-service/O=${layout.iotServiceOrg}`,
      });
    } finally {
      await fs.rm(extPath, { force: true });
    }
  }

  private async issueLeaf(input: {
    crtPath: string;
    csrPath: string;
    days: number;
    extPath: string;
    keyPath: string;
    layout: ReturnType<AdminEmqxCertSetupService['resolveLayout']>;
    subject: string;
  }): Promise<void> {
    await this.runOpenSsl(['genrsa', '-out', input.keyPath, '2048']);
    await this.runOpenSsl(['req', '-new', '-key', input.keyPath, '-out', input.csrPath, '-subj', input.subject]);
    try {
      await this.runOpenSsl([
        'x509',
        '-req',
        '-in',
        input.csrPath,
        '-CA',
        input.layout.caCrtPath,
        '-CAkey',
        input.layout.caKeyPath,
        '-CAcreateserial',
        '-out',
        input.crtPath,
        '-days',
        String(input.days),
        '-sha256',
        '-extfile',
        input.extPath,
      ]);
    } finally {
      await fs.rm(input.csrPath, { force: true });
      await fs.rm(`${input.layout.caCrtPath}.srl`, { force: true });
      await fs.rm(path.join(path.dirname(input.layout.caCrtPath), 'ca.srl'), { force: true });
    }
  }

  private resolveLayout() {
    const defaultCertDir = path.resolve(process.cwd(), '../../../docker/emqx/certs');
    const caCrtPath = this.resolveOutputPath(process.env.EMQX_ROOT_CA_PEM_PATH, path.join(defaultCertDir, 'ca.crt'));
    const caKeyPath = this.resolveOutputPath(process.env.EMQX_ROOT_CA_KEY_PEM_PATH, path.join(path.dirname(caCrtPath), 'ca.key'));
    const certDir = path.dirname(caCrtPath);
    const iotServiceCrtPath = this.resolveOutputPath(
      process.env.EMQX_MQTT_CLIENT_CERT_PEM_PATH,
      path.join(certDir, 'iot-service.crt'),
    );
    const iotServiceKeyPath = this.resolveOutputPath(
      process.env.EMQX_MQTT_CLIENT_KEY_PEM_PATH,
      path.join(certDir, 'iot-service.key'),
    );

    return {
      caCrtPath,
      caDays: this.readIntEnv('EMQX_BOOTSTRAP_CA_DAYS', 3650),
      caKeyPath,
      caName: (process.env.EMQX_BOOTSTRAP_CA_NAME ?? 'Lumimax EMQX Bootstrap Root CA').trim(),
      certDir,
      iotServiceCn: (process.env.EMQX_BOOTSTRAP_IOT_SERVICE_CN ?? process.env.EMQX_MQTT_USERNAME ?? 'lumimax_iot').trim(),
      iotServiceCrtPath,
      iotServiceCsrPath: path.join(certDir, 'iot-service.csr'),
      iotServiceKeyPath,
      iotServiceOrg: (process.env.EMQX_BOOTSTRAP_IOT_SERVICE_ORG ?? 'Lumimax').trim(),
      leafDays: this.readIntEnv('EMQX_BOOTSTRAP_LEAF_DAYS', 825),
      serverCn: (process.env.EMQX_BOOTSTRAP_SERVER_CN ?? 'emqx').trim(),
      serverCrtPath: path.join(certDir, 'server.crt'),
      serverCsrPath: path.join(certDir, 'server.csr'),
      serverKeyPath: path.join(certDir, 'server.key'),
      serverOrg: (process.env.EMQX_BOOTSTRAP_SERVER_ORG ?? 'Lumimax').trim(),
      serverSans: (process.env.EMQX_BOOTSTRAP_SERVER_SANS ?? 'DNS:emqx,DNS:localhost,IP:127.0.0.1').trim(),
    };
  }

  private resolveOutputPath(candidate: string | undefined, fallback: string): string {
    const value = candidate?.trim();
    if (!value) {
      return fallback;
    }
    return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
  }

  private readIntEnv(name: string, fallback: number): number {
    const raw = process.env[name]?.trim();
    const parsed = raw ? Number(raw) : Number.NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async toFileState(name: string, filePath: string): Promise<CertFileState> {
    return {
      exists: await this.pathExists(filePath),
      name,
      path: filePath,
    };
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async isDirWritable(dirPath: string): Promise<boolean> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      const probe = path.join(dirPath, `.write-test-${process.pid}-${Date.now()}`);
      await fs.writeFile(probe, 'ok', 'utf8');
      await fs.rm(probe, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  private async ensureWritable(dirPath: string): Promise<void> {
    if (await this.isDirWritable(dirPath)) {
      return;
    }
    throw new Error(`EMQX 证书目录不可写，请检查挂载与权限：${dirPath}`);
  }

  private async runOpenSsl(args: string[]): Promise<void> {
    try {
      await execFileAsync('openssl', args, { timeout: 30_000 });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`openssl 执行失败：${detail}`);
    }
  }
}
