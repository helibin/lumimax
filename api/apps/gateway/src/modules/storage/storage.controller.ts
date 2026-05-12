import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard';
import { BaseStorageGrpcAdapter } from '../../grpc/base-service.grpc-client';
import { requireUser, resolveTenantScope } from '../../controllers/controller-context.util';
import { GrpcInvokerService } from '../grpc-invoker.service';

@ApiTags('存储接口')
@ApiBearerAuth('bearer')
@UseGuards(AuthGuard)
@Controller('api/storage')
export class StorageController {
  constructor(
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BaseStorageGrpcAdapter) private readonly baseStorageGrpcAdapter: BaseStorageGrpcAdapter,
  ) {}

  @Post('upload-token')
  @ApiOperation({
    summary: '创建临时上传凭证',
    description: '创建一次临时文件上传授权，默认返回 presigned PUT 上传地址、objectKey、请求头和有效期等信息。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['filename'],
      properties: {
        filename: { type: 'string', example: 'meal.png' },
        mode: { type: 'string', enum: ['presigned-url', 'credentials'], example: 'presigned-url' },
        maxFileSize: { type: 'number', example: 10485760 },
        allowedMimeTypes: {
          type: 'array',
          items: { type: 'string' },
          example: ['image/png', 'image/jpeg'],
        },
        deviceId: { type: 'string', example: '01JDEVICE000000000000000001' },
        ownerType: { type: 'string', enum: ['user', 'device'], example: 'user' },
      },
    },
  })
  createUploadToken(@Req() req: any, @Body() body: Record<string, unknown>) {
    const user = requireUser(req);
    const tenantScope = resolveTenantScope(req, user);
    const deviceScoped = body.ownerType === 'device';
    const nextBody = {
      ...body,
      userId: deviceScoped ? undefined : user.userId,
      deviceId:
        typeof body.deviceId === 'string' && body.deviceId.trim().length > 0
          ? body.deviceId.trim()
          : undefined,
    };
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'storage.objects.createUploadToken',
      requestId: req.requestId,
      call: () =>
        this.baseStorageGrpcAdapter.execute({
          operation: 'storage.objects.createUploadToken',
          body: nextBody,
          user,
          tenantScope,
          requestId: req.requestId,
        }),
    });
  }

  @Post('objects/confirm')
  @ApiOperation({ summary: '确认上传完成', description: '上传完成后回调确认对象状态，供后续业务正式入库使用。' })
  confirmObject(@Req() req: any, @Body() body: Record<string, unknown>) {
    const user = requireUser(req);
    const tenantScope = resolveTenantScope(req, user);
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'storage.objects.confirm',
      requestId: req.requestId,
      call: () =>
        this.baseStorageGrpcAdapter.execute({
          operation: 'storage.objects.confirm',
          body: {
            ...body,
            userId: user.userId,
          },
          user,
          tenantScope,
          requestId: req.requestId,
        }),
    });
  }
}
