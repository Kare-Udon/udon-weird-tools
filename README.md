# Weird Tools Starter

一个纯静态、i18n 优先、浏览器端运行的个人工具集合 starter。

## 技术栈

- Astro static output
- TypeScript strict mode
- React islands
- Cloudflare Pages 静态托管
- 默认中文，英文作为第二语言
- 不使用 Pages Functions、不使用后端 API、不保存服务端数据

## 快速开始

```bash
npm install
npm run dev
```

构建：

```bash
npm run build
npm run preview
```

Cloudflare Pages 配置：

```text
Build command: npm run build
Build output directory: dist
```

## 目录结构

```text
src/
  components/       Astro/React 组件
  i18n/             语言配置、字典、路径工具
  layouts/          页面布局
  lib/              浏览器端运行时能力
  pages/            静态路由
  styles/           全局样式
  tools/            工具插件目录
scripts/
  validate-tools.mjs
public/
  _headers          Cloudflare Pages 静态响应头
```

## 新增工具

新建目录：

```text
src/tools/<slug>/
  manifest.ts
  schema.ts
  run.ts
  examples.ts
  index.ts
```

然后在下面两个文件注册：

```text
src/tools/registry.ts
src/tools/client-registry.ts
```

每个工具必须是浏览器端纯函数工具：

- 不访问远程 API
- 不读取 secret
- 不依赖服务端
- 不直接写 localStorage / IndexedDB
- 不使用 `eval` / `new Function`
- 输出必须可 JSON 序列化
- UI 文案必须支持中文和英文

运行校验：

```bash
npm run validate:tools
```

## 路由

默认中文不加前缀：

```text
/
/tools
/tools/json-cleaner
```

英文加前缀：

```text
/en
/en/tools
/en/tools/json-cleaner
```

## 当前内置工具

- JSON 清洗器
- 时间戳转换器
- 命名风格转换器

## 后续建议

高级能力可以之后再加：

- IndexedDB 历史记录
- 完整工作区导入/导出
- Web Worker 池
- PWA 离线缓存
- 本地小模型运行时
