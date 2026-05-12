import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { DocsService } from './docs.service';

void DocsService;

@ApiTags('docs-hub')
@Controller('api/docs')
export class DocsController {
  private readonly docsService: DocsService;

  constructor(docsService: DocsService) {
    this.docsService = docsService;
  }

  @Get('services')
  @ApiOperation({ summary: '文档服务列表', description: '返回 gateway 当前可用的 Swagger 文档服务列表。' })
  listServices() {
    return this.docsService.listServices();
  }

  @Get('openapi/:service')
  @ApiOperation({ summary: '获取指定服务 OpenAPI JSON', description: '按服务名返回聚合后的 OpenAPI 文档 JSON。' })
  @ApiParam({ name: 'service', description: '服务名称', example: 'gateway' })
  async getOpenApi(
    @Param('service') service: string,
    @Req() req: Record<string, unknown>,
    @Res() res: any,
  ) {
    const requestId = req?.requestId ?? req?.id;
    const payload = await this.docsService.getOpenApi(
      service,
      typeof requestId === 'string' ? requestId : undefined,
    );
    res.type('application/json').send(payload);
  }

  @Get('hub')
  @ApiExcludeEndpoint()
  renderHub(@Res() res: any): void {
    res.type('text/html').send(this.docsService.renderDocsHomePage());
  }

  @Get()
  @ApiExcludeEndpoint()
  renderDefaultDocs(@Res() res: any): void {
    res
      .type('text/html')
      .send(this.docsService.renderServiceSwaggerPage('gateway'));
  }

  @Get(':service')
  @ApiExcludeEndpoint()
  renderServiceDocs(
    @Param('service') service: string,
    @Res() res: any,
  ): void {
    res
      .type('text/html')
      .send(this.docsService.renderServiceSwaggerPage(service));
  }
}
