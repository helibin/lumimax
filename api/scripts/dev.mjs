/*
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-04-25 01:56:40
 * @LastEditTime: 2026-04-25 01:56:47
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/scripts/dev.mjs
 */
import { checkbox } from "@inquirer/prompts";
import { execa } from "execa";

const services = await checkbox({
  message: "选择要启动的服务",
  choices: [
    { name: "Gateway", value: "@lumimax/gateway" },
    { name: "Base Service", value: "@lumimax/base-service" },
    { name: "Biz Service", value: "@lumimax/biz-service" },
    { name: "IoT Service", value: "@lumimax/iot-service" }
  ]
});

if (!services.length) {
  console.log("未选择服务");
  process.exit(0);
}

const filters = services.flatMap((name) => ["--filter", name]);

await execa("pnpm", ["turbo", "run", "dev", ...filters, "--parallel"], {
  stdio: "inherit"
});
