#!/usr/bin/env node
// vh 入口：用 tsx 直接运行 TypeScript 源码（不需要构建步骤）。
import { register } from "tsx/esm/api";
register();
const { main } = await import("../src/main.ts");
process.exitCode = await main(process.argv.slice(2));
