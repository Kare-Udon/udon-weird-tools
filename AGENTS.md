# AGENTS.md

本文件约束 AI coding agents、自动化脚手架和人工维护者在本项目中的行为。目标是保持项目长期可扩展、纯静态、浏览器端运行、i18n 优先，并避免工具模块污染全局架构。

## 1. 项目定位

这是一个基于 Cloudflare Pages 的纯静态个人工具集合。

允许：

- Astro 静态页面
- TypeScript
- React islands
- 浏览器端计算
- 用户侧本地状态
- 构建期生成页面、索引、工具列表

禁止：

- Pages Functions
- Workers
- KV / D1 / R2 / Durable Objects
- 服务端 API
- 服务端数据库
- 服务端身份系统
- 在浏览器中硬编码 secret
- 工具默认访问外部网络

如果某个需求必须依赖服务端，先拒绝把它塞进当前架构，并把它记录为未来架构变更议题。

## 2. 技术栈边界

当前固定栈：

```text
Astro + TypeScript + React
```

要求：

- Astro 必须保持 `output: "static"`。
- 不添加 SSR adapter。
- 不创建 `functions/` 目录。
- 不添加 Cloudflare runtime bindings。
- 不把项目改成 SPA-only，除非有明确重构决策。
- React 只用于需要交互的 islands；普通页面优先使用 Astro 组件。

## 3. i18n 规则

默认语言是 `zh-CN`，第二语言是 `en`。

路由约定：

```text
/                         默认中文首页
/tools                    默认中文工具列表
/tools/<slug>             默认中文工具页
/en                       英文首页
/en/tools                 英文工具列表
/en/tools/<slug>          英文工具页
```

规则：

- 新增全局 UI 文案必须写入 `src/i18n/ui.ts`。
- 新增工具文案必须写在工具 manifest、schema 和 examples 的 localized fields 中。
- 不要在页面组件中散落硬编码的用户可见文案。
- 每个工具必须至少提供 `zh-CN` 和 `en` 两套名称、描述、字段标签和示例名称。
- 默认中文路径不加语言前缀。
- 新语言应先扩展 `src/i18n/config.ts`，再补齐所有字典和工具文案。

## 4. 工具模块契约

每个工具必须位于：

```text
src/tools/<slug>/
```

必需文件：

```text
manifest.ts
schema.ts
run.ts
examples.ts
index.ts
```

推荐结构：

```text
src/tools/<slug>/
  manifest.ts      工具元信息，不包含运行逻辑
  schema.ts        输入字段定义，不包含运行逻辑
  run.ts           纯运行逻辑
  examples.ts      示例输入
  index.ts         统一导出 ToolModule
```

工具模块必须满足：

- `manifest.runtime` 必须是 `client`。
- `manifest.execution.pure` 必须是 `true`。
- `run()` 必须是确定性浏览器端函数，除非 manifest 明确声明例外。
- `run()` 不得直接操作 DOM。
- `run()` 不得直接访问 localStorage、IndexedDB、cookies、sessionStorage。
- `run()` 不得进行远程网络请求。
- `run()` 不得读取环境变量。
- `run()` 输出必须可 JSON 序列化。
- 大计算工具未来应迁移到 Web Worker，不要阻塞主线程。

## 5. 注册规则

新增工具后必须更新：

```text
src/tools/registry.ts
src/tools/client-registry.ts
```

要求：

- slug 必须与目录名一致。
- slug 只能使用小写字母、数字和连字符。
- manifest 中的 slug 必须唯一。
- 工具必须能通过 `npm run validate:tools`。

## 6. 数据规则

当前阶段只实现轻量用户侧数据，不实现完整导出/备份。

允许：

- React island 通过统一 helper 写少量 localStorage，例如最近输入、最近结果、收藏状态。
- 未来在 `src/lib/local/` 下添加 IndexedDB adapter。

禁止：

- 工具 `run.ts` 直接写 localStorage。
- 工具模块直接访问 IndexedDB。
- 工具模块存储用户文件。
- 将用户数据上传到任何远程服务。

未来导出/备份功能必须是浏览器端导入/导出，不引入服务端存储。

## 7. 安全规则

禁止在任何工具代码中使用：

```text
eval
new Function
document.write
innerHTML 直接注入未净化内容
远程 script 注入
任意 fetch 到第三方域名
```

默认 CSP 位于：

```text
public/_headers
```

如果某个功能需要放宽 CSP，必须说明原因，并且只放宽到最小范围。

## 8. 依赖规则

新增依赖前先判断：

1. 是否真的需要依赖？
2. 是否会显著增加前端 bundle？
3. 是否会影响所有工具，还是只应被单个工具懒加载？
4. 是否会访问网络、注入脚本或要求服务端？

规则：

- 小工具优先手写逻辑。
- 大依赖必须懒加载。
- 不要为了一个工具污染全局 bundle。
- 不添加会默认请求外部 CDN 的依赖。

## 9. 代码风格

- TypeScript 优先，避免 `any`。
- 工具输入和输出类型必须显式导出。
- 组件保持简洁，不做过度抽象。
- 页面布局优先使用 Astro。
- 交互区域使用 React island。
- CSS 使用全局简洁样式，不引入重型 UI 库。

## 10. 新工具 checklist

新增工具时逐项确认：

```text
[ ] src/tools/<slug>/manifest.ts 已创建
[ ] src/tools/<slug>/schema.ts 已创建
[ ] src/tools/<slug>/run.ts 已创建
[ ] src/tools/<slug>/examples.ts 已创建
[ ] src/tools/<slug>/index.ts 已创建
[ ] slug 与目录名一致
[ ] manifest 文案包含 zh-CN 和 en
[ ] 字段标签包含 zh-CN 和 en
[ ] 示例名称包含 zh-CN 和 en
[ ] run.ts 不访问网络
[ ] run.ts 不访问 localStorage / IndexedDB
[ ] run.ts 不操作 DOM
[ ] 输出可 JSON 序列化
[ ] 已更新 registry.ts
[ ] 已更新 client-registry.ts
[ ] npm run validate:tools 通过
[ ] npm run build 通过
```

## 11. 允许改动范围

AI agent 新增普通工具时，只允许改：

```text
src/tools/<slug>/
src/tools/registry.ts
src/tools/client-registry.ts
```

如果需要新增全局 UI 文案，可改：

```text
src/i18n/ui.ts
```

如果需要新增公共组件或运行时能力，必须保持小范围，并优先放在：

```text
src/components/
src/lib/
```

不要随意修改：

```text
astro.config.mjs
public/_headers
src/layouts/BaseLayout.astro
src/i18n/config.ts
scripts/validate-tools.mjs
```

除非任务明确要求架构调整。

## 12. 构建命令

常用命令：

```bash
npm install
npm run dev
npm run validate:tools
npm run typecheck
npm run build
```

交付前最低要求：

```bash
npm run validate:tools
npm run build
```
