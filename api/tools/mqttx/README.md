# MQTTX CLI 测试脚本（设备协议 v1.0）

本目录仅提供 MQTTX CLI 脚本，不包含 MQTTX Desktop 导入文件。

## 前置

- 已安装 [MQTTX CLI](https://mqttx.app/cli)
- `biz-service` / `gateway` 已启动，并能接收对应上行 topic
- 如使用 EMQX mTLS，请准备设备证书、私钥与 CA

## 环境变量

- `MQTT_HOST`（默认 `localhost`）
- `MQTT_PORT`（默认 `1883`，TLS 常用 `8883`）
- `MQTT_PROTOCOL`（`mqtt` 或 `mqtts`，默认 `mqtt`）
- `MQTT_CA`（可选，TLS CA）
- `MQTT_CERT`（可选，TLS cert）
- `MQTT_KEY`（可选，TLS key）
- `DEVICE_ID`（默认 `SN_12345`）

## 发布全部上行测试事件

```bash
chmod +x ./tools/mqttx/mqttx-cli-publish-all.sh
./tools/mqttx/mqttx-cli-publish-all.sh
```

## 订阅设备下行

```bash
chmod +x ./tools/mqttx/mqttx-cli-subscribe-downlink.sh
./tools/mqttx/mqttx-cli-subscribe-downlink.sh
```

订阅脚本监听 `v1/+/{DEVICE_ID}/res`，可观察 `analysis.result`、`cmd` 回执等下行消息。
