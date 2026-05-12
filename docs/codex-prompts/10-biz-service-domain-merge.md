# Biz Service Domain Merge Guide

## 目标

`biz-service` 内部不要把所有模块平铺成很多一级目录，而是合并为 4 个一级业务域，方便 MVP 阶段维护，也方便后续拆分为独立服务。

## 合并后的一级目录

```text
apps/biz-service/src/
├── device-domain/
├── iot-domain/
├── meal-domain/
├── realtime-domain/
├── grpc/
├── common/
├── app.module.ts
└── main.ts
```

## 原模块合并关系

```text
devices             → device-domain/devices
device-bindings     → device-domain/bindings
device-commands     → device-domain/commands
telemetry           → device-domain/telemetry
ota                 → device-domain/ota

iot-bridge          → iot-domain/bridge
iot provider        → iot-domain/providers
iot inbound events  → iot-domain/events

meals               → meal-domain/meals
food-analysis       → meal-domain/food-analysis
nutrition           → meal-domain/nutrition
third-party providers → meal-domain/providers

realtime-events     → realtime-domain/events
realtime publishers → realtime-domain/publishers
```

## 推荐目录结构

```text
apps/biz-service/src/
├── device-domain/
│   ├── devices/
│   ├── bindings/
│   ├── commands/
│   ├── telemetry/
│   ├── ota/
│   ├── entities/
│   ├── dto/
│   ├── interfaces/
│   ├── device-domain.module.ts
│   └── device-domain.facade.ts
│
├── iot-domain/
│   ├── bridge/
│   ├── providers/
│   │   ├── aws/
│   │   └── aliyun/
│   ├── events/
│   ├── interfaces/
│   ├── dto/
│   ├── iot-domain.module.ts
│   └── iot-domain.facade.ts
│
├── meal-domain/
│   ├── meals/
│   ├── food-analysis/
│   ├── nutrition/
│   ├── providers/
│   │   ├── vision/
│   │   ├── nutritionix/
│   │   ├── usda-fdc/
│   │   └── estimator/
│   ├── entities/
│   ├── dto/
│   ├── interfaces/
│   ├── meal-domain.module.ts
│   └── meal-domain.facade.ts
│
└── realtime-domain/
    ├── events/
    ├── publishers/
    ├── dto/
    ├── interfaces/
    ├── realtime-domain.module.ts
    └── realtime-domain.facade.ts
```

## 跨 Domain 调用规则

每个 domain 必须通过 facade 暴露能力。

允许：

```text
device-domain → iot-domain facade
meal-domain   → realtime-domain facade
meal-domain   → device-domain facade
iot-domain    → device-domain facade
```

禁止：

```text
meal-domain 直接 import device-domain/devices/*.repository
iot-domain 直接操作 meal-domain 数据表
realtime-domain 写 meal / device 核心业务逻辑
```

## 未来拆分方向

```text
device-domain   → device-service
iot-domain      → iot-bridge-service
meal-domain     → diet-service / nutrition-service
realtime-domain → realtime-service
```

## 给 Codex 的补充要求

在实现 `biz-service` 时，请按 domain 合并后的目录结构开发。不要再创建平铺的：

```text
devices/
device-bindings/
iot-bridge/
meals/
food-analysis/
nutrition/
realtime-events/
ota/
telemetry/
device-commands/
```

这些只能作为对应 domain 下的子模块存在。
