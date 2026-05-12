import { Controller, Get, Req, Res } from '@nestjs/common';
import { getEnvString } from '@lumimax/config';

@Controller('file')
export class StoragePublicController {
  @Get('*path')
  redirectObject(@Req() req: any, @Res() res: any) {
    const objectKey = normalizeObjectKey(req.params?.path);
    const publicBaseUrl = getEnvString('STORAGE_PUBLIC_BASE_URL', '')?.trim() ?? '';

    if (!objectKey) {
      return res.status(400).json({ code: 400, msg: 'objectKey is required' });
    }
    if (!publicBaseUrl) {
      return res.status(503).json({ code: 503, msg: 'STORAGE_PUBLIC_BASE_URL is not configured' });
    }

    return res.redirect(buildPublicUrl(publicBaseUrl, objectKey));
  }
}

function normalizeObjectKey(pathname: unknown): string {
  const raw = Array.isArray(pathname)
    ? pathname.filter((segment): segment is string => typeof segment === 'string').join('/')
    : typeof pathname === 'string'
      ? pathname
      : '';
  return decodeURIComponent(raw).replace(/^\/+/, '').trim();
}

function buildPublicUrl(baseUrl: string, objectKey: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const encodedPath = objectKey
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${normalizedBaseUrl}/${encodedPath}`;
}
