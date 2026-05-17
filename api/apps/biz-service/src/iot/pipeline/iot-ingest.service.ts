import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '@lumimax/logger';
import { IotMessageRegistryService } from './iot-message-registry.service';
import { IotNormalizerService } from './iot-normalizer.service';
import { IotDownlinkService } from '../transport/iot-downlink.service';
import { IotDispatcherService } from './iot-dispatcher.service';
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
    @Inject(IotDispatcherService)
    private readonly iotDispatcherService: IotDispatcherService,
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
  }): Promise<IngestResult> {
    const normalized = this.iotNormalizerService.normalize({
      vendor: input.vendor,
      topic: input.topic,
      payload: input.payload,
      receivedAt: input.receivedAt,
    });
    return this.processNormalizedMessage(normalized, {
      shouldRecord: true,
      rawMessage: input,
    });
  }

  async ingestNormalizedMessage(normalized: NormalizedBizIotMessage): Promise<IngestResult> {
    return this.processNormalizedMessage(normalized, {
      shouldRecord: false,
      rawMessage: normalized,
    });
  }

  private async processNormalizedMessage(
    normalized: NormalizedBizIotMessage,
    options: { shouldRecord: boolean; rawMessage?: unknown },
  ): Promise<IngestResult> {
    const recorded = options.shouldRecord
      ? await this.iotMessageRegistryService.recordReceived(normalized)
      : undefined;
    if (!options.shouldRecord) {
      const claim = await this.iotMessageRegistryService.claimHandling(normalized.requestId);
      if (!claim.claimed) {
        this.logger.debug(
          'IoT 业务事件已被其他消费者处理或正在处理，跳过重复投递',
          {
            requestId: normalized.requestId,
            idLabel: 'ReqId',
            deviceId: normalized.deviceId,
            topic: normalized.topic,
            topicKind: normalized.topicKind,
            event: normalized.event,
            previousStatus: claim.status ?? null,
          },
          IotIngestService.name,
        );
        return {
          success: true,
          message: 'duplicate skipped',
          result: {
            accepted: true,
            skipped: true,
            duplicate: true,
            requestId: normalized.requestId,
            previousStatus: claim.status ?? null,
          },
          normalized: summarizeNormalized(normalized),
        };
      }
    }

    this.logger.debug(
      '收到 IoT 原始消息',
      {
        requestId: normalized.requestId,
        idLabel: 'ReqId',
        ...buildIncomingMessageLog(normalized.payload, normalized),
        rawMessage: buildRawIncomingMessageLog(normalized, options.rawMessage),
      },
      IotIngestService.name,
    );

    if (recorded?.duplicate) {
      if (isTerminalOrProcessingStatus(recorded.entity.status)) {
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
        await this.publishFailureFeedback(normalized, 'duplicate_request');
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
      const result = await this.iotDispatcherService.dispatch(normalized);
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
          delivery: published.delivery,
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
      await this.publishFailureFeedback(normalized, details.message);
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

  private async publishFailureFeedback(
    message: NormalizedBizIotMessage,
    reason: string,
  ): Promise<void> {
    const response = buildFailureDownlink(message, reason);
    if (response) {
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
      return;
    }

    const connectionFeedback = buildConnectionFeedbackDownlink(message, reason);
    if (!connectionFeedback) {
      return;
    }
    await this.iotDownlinkService.publishConnectionFeedback({
      vendor: message.vendor,
      deviceId: message.deviceId,
      topicKind: connectionFeedback.topicKind,
      requestId: message.requestId,
      reason,
      qos: 1,
      payload: {
        meta: {
          requestId: message.requestId,
          deviceId: message.deviceId,
          timestamp: Date.now(),
          event: connectionFeedback.event,
          version: '1.0',
          locale: message.locale,
        },
        data: connectionFeedback.data,
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

function isTerminalOrProcessingStatus(status: string | undefined): boolean {
  return ['processing', 'handled', 'skipped'].includes(String(status ?? ''));
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

function buildRawIncomingMessageLog(
  normalized: NormalizedBizIotMessage,
  rawMessage: unknown,
): Record<string, unknown> {
  const raw = asRecord(rawMessage);
  const payload = Object.prototype.hasOwnProperty.call(raw, 'payload')
    ? raw.payload
    : normalized.payload;
  return {
    vendor: pickString(raw.vendor) ?? normalized.vendor,
    topic: pickString(raw.topic) ?? normalized.topic,
    receivedAt: normalizeLogDate(raw.receivedAt ?? normalized.receivedAt),
    payload: summarizeLogValue(payload),
  };
}

function summarizeLogValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return value.length > 2000
      ? `${value.slice(0, 2000)}...(truncated ${value.length - 2000} chars)`
      : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Buffer.isBuffer(value)) {
    return `[Buffer(${value.length})]`;
  }
  if (Array.isArray(value)) {
    const sliced = value.slice(0, 20).map((item) => summarizeLogValue(item, depth + 1));
    if (value.length > sliced.length) {
      sliced.push(`...(truncated ${value.length - sliced.length} items)`);
    }
    return sliced;
  }
  if (typeof value === 'object') {
    if (depth >= 5) {
      return '[Object]';
    }
    const entries = Object.entries(value as Record<string, unknown>);
    const output: Record<string, unknown> = {};
    for (const [key, nested] of entries.slice(0, 40)) {
      output[key] = summarizeLogValue(nested, depth + 1);
    }
    if (entries.length > 40) {
      output.__truncatedKeys = entries.length - 40;
    }
    return output;
  }
  return String(value);
}

function normalizeLogDate(value: unknown): string | number | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const text = pickString(value);
  return text ?? null;
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
    case 'upload.url.request':
      return {
        topicKind: BizIotTopicKind.EVENT_RES,
        event: 'upload.url.result',
        data: {
          code,
          msg: failureMessage(code, reason, 'upload url failed'),
          errorCode:
            code === 40001
              ? 'invalid_payload'
              : code === 40900
                ? 'duplicate_request'
                : 'upload_url_failed',
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

function buildConnectionFeedbackDownlink(
  message: NormalizedBizIotMessage,
  reason: string,
): { topicKind: BizIotTopicKind; event: string; data: Record<string, unknown> } | null {
  if (!isLifecycleEvent(message)) {
    return null;
  }
  const duplicateRequest = reason.toLowerCase().includes('duplicate') || reason.includes('重复请求');
  return {
    topicKind: BizIotTopicKind.EVENT_RES,
    event: 'connection.feedback.result',
    data: {
      code: duplicateRequest ? 40900 : 50000,
      msg: duplicateRequest ? '重复请求' : reason || 'connection feedback failed',
      errorCode: duplicateRequest ? 'duplicate_request' : 'connection_feedback_failed',
      sourceEvent: message.event,
    },
  };
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

type IngestResult = {
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
};
