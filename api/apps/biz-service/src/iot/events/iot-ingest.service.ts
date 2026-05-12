import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '@lumimax/logger';
import { IotMessageRegistryService } from './iot-message-registry.service';
import { IotNormalizerService } from './iot-normalizer.service';
import { IotDownlinkService } from '../providers/aws/iot-downlink.service';
import { IotEventDispatcherService } from './iot-event-dispatcher.service';
import {
  BizIotTopicKind,
  type CloudIotVendorName,
  type NormalizedBizIotMessage,
} from '../iot.types';

@Injectable()
export class IotIngestService {
  constructor(
    @Inject(AppLogger) private readonly logger: AppLogger,
    @Inject(IotNormalizerService)
    private readonly iotNormalizerService: IotNormalizerService,
    @Inject(IotEventDispatcherService)
    private readonly iotEventDispatcherService: IotEventDispatcherService,
    @Inject(IotMessageRegistryService)
    private readonly iotMessageRegistryService: IotMessageRegistryService,
    @Inject(IotDownlinkService) private readonly iotDownlinkService: IotDownlinkService,
  ) {}

  async ingestCloudMessage(input: {
    vendor: CloudIotVendorName;
    topic: string;
    payload: Record<string, unknown>;
    receivedAt?: number;
    requestId?: string;
  }): Promise<{
    success: boolean;
    message: string;
    result?: Record<string, unknown>;
    normalized: {
      requestId: string;
      topic: string;
      topicKind: BizIotTopicKind;
      event: string;
      deviceId: string;
      locale: string;
    };
  }> {
    const normalized = this.iotNormalizerService.normalize({
      vendor: input.vendor,
      topic: input.topic,
      payload: input.payload,
      receivedAt: input.receivedAt,
    });
    this.logger.debug(
      '收到 IoT 原始消息',
      {
        requestId: normalized.requestId,
        idLabel: 'ReqId',
        ...buildIncomingMessageLog(input.payload, normalized),
      },
      IotIngestService.name,
    );
    const recorded = await this.iotMessageRegistryService.recordReceived(normalized);
    if (recorded.duplicate) {
      if (recorded.entity.status === 'handled' || recorded.entity.status === 'skipped') {
        this.logger.warn(
          '检测到重复 IoT 消息，已跳过处理',
          {
            requestId: normalized.requestId,
            idLabel: 'ReqId',
            deviceId: normalized.deviceId,
            topic: normalized.topic,
            topicKind: normalized.topicKind,
            event: normalized.event,
            previousStatus: recorded.entity.status,
          },
          IotIngestService.name,
        );
        if (!isLifecycleEvent(normalized)) {
          await this.publishFailureDownlink(normalized, 'duplicate_request');
        }
        return {
          success: true,
          message: 'duplicate skipped',
          result: {
            accepted: true,
            skipped: true,
            duplicate: true,
            requestId: normalized.requestId,
          },
          normalized: summarizeNormalized(normalized),
        };
      }
      this.logger.warn(
        '检测到重复 IoT 消息，但上次处理未完成，本次继续处理',
        {
          requestId: normalized.requestId,
          idLabel: 'ReqId',
          deviceId: normalized.deviceId,
          topic: normalized.topic,
          topicKind: normalized.topicKind,
          event: normalized.event,
          previousStatus: recorded.entity.status,
        },
        IotIngestService.name,
      );
    }
    try {
      const result = await this.iotEventDispatcherService.dispatch(normalized);
      let downlinkSummary: Record<string, unknown> | undefined;
      if (result.downlink) {
        const published = await this.iotDownlinkService.publish({
          vendor: normalized.vendor,
          deviceId: normalized.deviceId,
          topicKind: result.downlink.topicKind,
          requestId: normalized.requestId,
          qos: result.downlink.qos,
          payload: {
            meta: {
              requestId: normalized.requestId,
              deviceId: normalized.deviceId,
              timestamp: Date.now(),
              event: result.downlink.event,
              version: '1.0',
              locale: normalized.locale,
            },
            data: result.downlink.data,
          },
        });
        downlinkSummary = {
          topic: published.topic,
          event: result.downlink.event,
          qos: result.downlink.qos ?? 1,
          published: published.published,
          result: summarizeDownlinkResult(result.downlink.data),
        };
      }
      await this.iotMessageRegistryService.markHandled(
        normalized.requestId,
        result,
        result.skipped ? 'skipped' : 'handled',
      );
      this.logger.debug(
        'IoT 消息处理完成',
        {
          requestId: normalized.requestId,
          idLabel: 'ReqId',
          deviceId: normalized.deviceId,
          topic: normalized.topic,
          topicKind: normalized.topicKind,
          event: normalized.event,
          handledBy: result.handledBy ?? null,
          skipped: result.skipped ?? false,
          ...(downlinkSummary ? { downlink: downlinkSummary } : {}),
        },
        IotIngestService.name,
      );
      return {
        success: true,
        message: 'ok',
        result,
        normalized: summarizeNormalized(normalized),
      };
    } catch (error) {
      const details = {
        message: error instanceof Error ? error.message : String(error),
      };
      if (!isLifecycleEvent(normalized)) {
        await this.publishFailureDownlink(normalized, details.message);
      }
      await this.iotMessageRegistryService.markFailed(normalized.requestId, details);
      this.logger.warn(
        'IoT 消息处理失败，已下发失败响应',
        {
          requestId: normalized.requestId,
          idLabel: 'ReqId',
          deviceId: normalized.deviceId,
          topic: normalized.topic,
          topicKind: normalized.topicKind,
          event: normalized.event,
          reason: details.message,
        },
        IotIngestService.name,
      );
      return {
        success: false,
        message: details.message,
        result: {
          accepted: true,
          failed: true,
          requestId: normalized.requestId,
          reason: details.message,
        },
        normalized: summarizeNormalized(normalized),
      };
    }
  }

  private async publishFailureDownlink(
    message: NormalizedBizIotMessage,
    reason: string,
  ): Promise<void> {
    const response = buildFailureDownlink(message, reason);
    if (!response) {
      return;
    }
    await this.iotDownlinkService.publish({
      vendor: message.vendor,
      deviceId: message.deviceId,
      topicKind: response.topicKind,
      requestId: message.requestId,
      qos: 1,
      payload: {
        meta: {
          requestId: message.requestId,
          deviceId: message.deviceId,
          timestamp: Date.now(),
          event: response.event,
          version: '1.0',
          locale: message.locale,
        },
        data: response.data,
      },
    });
  }
}

function summarizeDownlinkResult(data: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(typeof data.code === 'number' ? { code: data.code } : {}),
    ...(typeof data.msg === 'string' && data.msg.trim() ? { msg: data.msg.trim() } : {}),
    ...(typeof data.errorCode === 'string' && data.errorCode.trim()
      ? { errorCode: data.errorCode.trim() }
      : {}),
    ...(typeof data.status === 'string' && data.status.trim() ? { status: data.status.trim() } : {}),
  };
}

function isLifecycleEvent(message: NormalizedBizIotMessage): boolean {
  return message.topicKind === BizIotTopicKind.STATUS_REQ;
}

function summarizeNormalized(message: NormalizedBizIotMessage): {
  requestId: string;
  topic: string;
  topicKind: BizIotTopicKind;
  event: string;
  deviceId: string;
  locale: string;
} {
  return {
    requestId: message.requestId,
    topic: message.topic,
    topicKind: message.topicKind,
    event: message.event,
    deviceId: message.deviceId,
    locale: message.locale,
  };
}

function buildIncomingMessageLog(
  payload: Record<string, unknown>,
  normalized: NormalizedBizIotMessage,
): Record<string, unknown> {
  const meta = asRecord(payload.meta);
  const data = asRecord(payload.data);
  const version = pickString(meta.version);
  if (meta.requestId || meta.deviceId || meta.timestamp || meta.event || version || payload.data) {
    return {
      meta: {
        requestId: pickString(meta.requestId) ?? normalized.requestId,
        deviceId: pickString(meta.deviceId) ?? normalized.deviceId,
        timestamp: pickNumber(meta.timestamp) ?? normalized.timestamp,
        event: pickString(meta.event) ?? normalized.event,
        version: version ?? '1.0',
        locale: pickString(meta.locale) ?? normalized.locale,
      },
      data,
    };
  }
  return payload;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function buildFailureDownlink(
  message: NormalizedBizIotMessage,
  reason: string,
): { topicKind: BizIotTopicKind; event: string; data: Record<string, unknown> } | null {
  const lower = reason.toLowerCase();
  const invalidPayload = lower.includes('invalid') || lower.includes('required');
  const mealRecordMissing = lower.includes('meal record not found');
  const alreadyFinished = lower.includes('already finished');
  const duplicateRequest = lower.includes('duplicate') || reason.includes('重复请求');
  const objectKeyInvalid = lower.includes('objectkey') || lower.includes('object key');
  const visionTimeout = lower.includes('图片识别超时') || lower.includes('connect timeout') || lower.includes('und_err_connect_timeout') || lower.includes('请求超时');
  const visionRateLimit = lower.includes('图片识别服务限流');
  const visionUnauthorized = lower.includes('图片识别服务鉴权失败');
  const visionUnavailable = lower.includes('图片识别服务暂不可用');
  const visionBadResponse = lower.includes('图片识别服务返回异常') || lower.includes('图片识别服务调用失败');
  const code = duplicateRequest
    ? 40900
    : alreadyFinished
      ? 40910
    : visionTimeout
      ? 50408
    : visionRateLimit
      ? 42908
    : visionUnauthorized
      ? 50201
    : visionUnavailable
      ? 50308
    : visionBadResponse
      ? 50208
    : objectKeyInvalid
      ? 42200
      : mealRecordMissing
        ? 40400
        : invalidPayload
          ? 40001
          : 50000;
  switch (message.event) {
    case 'upload.token.request':
      return {
        topicKind: BizIotTopicKind.EVENT_RES,
        event: 'upload.token.result',
        data: {
          code,
          msg: failureMessage(code, reason, 'upload token failed'),
          errorCode:
            code === 40001
              ? 'invalid_payload'
              : code === 40900
                ? 'duplicate_request'
                : 'upload_token_failed',
        },
      };
    case 'meal.record.create':
      return {
        topicKind: BizIotTopicKind.EVENT_RES,
        event: 'meal.record.result',
        data: {
          code,
          msg: failureMessage(code, reason, 'meal record create failed'),
          errorCode:
            code === 40001
              ? 'invalid_payload'
              : code === 40900
                ? 'duplicate_request'
                : 'meal_record_create_failed',
          mealRecordId: pickString(message.payload.mealRecordId) ?? null,
        },
      };
    case 'food.analysis.request':
      return {
        topicKind: BizIotTopicKind.EVENT_RES,
        event: 'food.analysis.result',
        data: {
          code,
          msg: failureMessage(code, reason, 'food analysis failed'),
          errorCode:
            code === 40001
              ? 'food_analysis_invalid_request'
              : code === 40400
                ? 'meal_record_not_found'
                : code === 40900
                  ? 'duplicate_request'
                : code === 40910
                  ? 'meal_record_already_finished'
                  : code === 50408
                    ? 'food_analysis_timeout'
                    : code === 42908
                      ? 'food_analysis_rate_limited'
                      : code === 50201
                        ? 'food_analysis_provider_unauthorized'
                        : code === 50308
                          ? 'food_analysis_provider_unavailable'
                          : code === 50208
                            ? 'food_analysis_provider_bad_response'
                  : 'food_analysis_failed',
        },
      };
    case 'food.analysis.confirm.request':
      return {
        topicKind: BizIotTopicKind.EVENT_RES,
        event: 'food.analysis.confirm.result',
        data: {
          code,
          msg: failureMessage(code, reason, 'food analysis confirm failed'),
          errorCode:
            code === 40001
              ? 'food_analysis_confirm_invalid_request'
              : code === 40400
                ? 'meal_record_not_found'
                : code === 40900
                  ? 'duplicate_request'
                  : code === 40910
                    ? 'meal_record_already_finished'
                    : 'food_analysis_confirm_failed',
        },
      };
    case 'nutrition.analysis.request':
      return {
        topicKind: BizIotTopicKind.EVENT_RES,
        event: 'nutrition.analysis.result',
        data: {
          code,
          msg: failureMessage(code, reason, 'nutrition analysis failed'),
          errorCode:
            code === 40001
              ? 'nutrition_analysis_invalid_request'
              : code === 40400
                ? 'meal_record_not_found'
                : code === 40900
                  ? 'duplicate_request'
                : code === 40910
                  ? 'meal_record_already_finished'
                  : 'nutrition_analysis_failed',
        },
      };
    case 'connect.register':
      return {
        topicKind: BizIotTopicKind.CONNECT_RES,
        event: 'connect.register.result',
        data: {
          code,
          msg: failureMessage(code, reason, 'connect register failed'),
          errorCode:
            code === 40001
              ? 'invalid_payload'
              : code === 40900
                ? 'duplicate_request'
                : 'connect_register_failed',
        },
      };
    default:
      return null;
  }
}

function failureMessage(code: number, reason: string, fallback: string): string {
  if (code === 40001) return '请求参数无效';
  if (code === 42200) return reason || 'objectKey 无效';
  if (code === 40400) return '餐次记录不存在';
  if (code === 40900) return '重复请求';
  if (code === 40910) return reason || '餐次记录已完成';
  if (code === 50408) return '图片识别超时';
  if (code === 42908) return '图片识别服务限流';
  if (code === 50201) return '图片识别服务鉴权失败';
  if (code === 50308) return '图片识别服务暂不可用';
  if (code === 50208) return '图片识别服务返回异常';
  return fallback;
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
