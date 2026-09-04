# 图像切分开发记录

日期：2026-08-31。需求基准为 `PLANS.md` 与 `design/image-splitter-design-v3.png`。桌面不采用已拒绝的 v4 居中方案。

## 协作约束

- 当前任务负责要求、接口、文件归属、集成验收与本文档。
- 后台工作任务均从 Luna / max 开始，使用当前共享检出。不得提交、推送、部署或另建工作任务。
- 一个文件只允许一个活动任务写入。依赖未稳定前不派发界面集成。
- 连续两次实质性纠正仍未通过同一证据门槛，才将原任务提升为 Sol / xhigh；在此记录原因。
- 代码与模拟能力测试不能替代真实浏览器、目录保存或手机相册验证。

## 基线

- 分支：`main`；起点：`9c40a5d`（Redesign Codex analyzer cost views）。
- 开发前只有未跟踪的 `PLANS.md`，没有图像切分实现；`design/` 参考图被现有规则忽略。
- 基线验证：`npm run validate:tools` 通过；已有工具/公共 helper 回归 32/32 通过。原样 `npm run typecheck` 在扫描既有 `public/vendor/onnxruntime/` 后触发 Node 约 4 GiB 堆内存上限，退出 134；发生于新增功能之前，后续独立复核，不通过修改既有 vendor 或忽略新文件规避。
- 使用临时验收配置检查完整 `src/`、不分析复制的 `public/vendor/` 后，基线为 1 个既有错误：`SpeechToTextTool.tsx:333` 对 `void | Promise<void>` 调用 `.catch`。日志为 `.dev-runtime/image-splitter/baseline-source-typecheck.log`；新工具尚无实现时已复现。后续验收比较新增诊断，不修改语音工具来扩大本次范围。

## 固定边界

### 纯工具模块

`src/tools/image-splitter/run.ts` 显式导出以下结构与 `run`。不使用 DOM、Canvas、File、Blob、时钟、随机数、存储或网络。

```ts
type SplitDirection = 'vertical' | 'horizontal';
type SplitMode = 'equal' | 'free';
type SliceRect = { index: number; x: number; y: number; width: number; height: number };
type ImageSplitterInput = {
  width: number; height: number; direction: SplitDirection;
  count: number; mode: SplitMode; cuts?: number[];
};
type ImageSplitterOutput = {
  width: number; height: number; direction: SplitDirection;
  count: number; mode: SplitMode; cuts: number[]; slices: SliceRect[];
};
```

`index` 从 0 开始，全部坐标为源图整数像素。方向、对称、短轴与模式恢复遵循计划。核心任务已在 `.dev-runtime/image-splitter/core/handoff.md` 冻结状态 helper、错误码与公开签名。

### 浏览器适配层

浏览器任务只写 `src/lib/image-splitter/`。它可以声明与 `SliceRect` 结构相同的本地类型，避免运行时依赖尚未完成的工具模块。至少提供：

- 解码函数：接收 `File` 和可选取消信号；返回源宽高、可绘制对象、轻量预览 URL 与显式释放函数。
- 编码函数：接收解码结果、`SliceRect[]`、原文件名和可选取消信号；按顺序返回原尺寸 PNG `File[]`，逐张复用画布。
- ZIP 函数：接收已经生成的 `File[]`，返回可直接下载的 ZIP `File`。不得在点击分享或选择器前等待编码/打包。
- 保存能力与执行函数：依据真实 API 与实际 `File[]`，支持手机分享、桌面目录/单文件选择、显式 ZIP/下载。返回可区分取消、失败、部分成功、交给系统及已写入的结果。
- 统一限额常量与可本地化的错误码；首版值见计划，不新增依赖。

浏览器任务已在 `.dev-runtime/image-splitter/browser/handoff.md` 冻结函数签名、错误码与资源所有权。界面现在可以依据两个已冻结的接口并行开发；联合验证等待两个底层实现的 GREEN。纯算法与浏览器任务不修改对方的实现。

## 文件归属与任务登记

| 工作任务 | 模型 / 思考 | 可写范围 | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| 核心算法与状态 `01a05597-96eb-7150-be1b-366b3634637f`（local） | gpt-5.6-luna / max | `src/tools/image-splitter/`，不含 `ui.ts`；证据 `core/` | 固定输入输出与计划，无运行时依赖 | 已交接并停止写入，独立复核通过 |
| 浏览器图像与保存 `01a05598-3a02-74b3-82ed-070a32942eca`（local） | 初始 gpt-5.6-luna / max；两次真实像素验收失败后升级 gpt-5.6-sol / xhigh | `src/lib/image-splitter/`；证据 `browser/` | 固定裁切矩形结构与计划，无运行时依赖 | 已交接并停止写入，49 项实际浏览器检查通过 |
| v3 界面与注册 `01a055ac-cef4-7f21-83a5-46f8d358263a`（local） | gpt-5.6-luna / max | `ImageSplitterTool.tsx/.css`、工具 `ui.ts`、`ToolPlayground.tsx`、`ToolDetailPage.astro`、两个 registry；必要局部 helper 为 `src/components/image-splitter/`，证据 `ui/` | 两份已冻结的 API handoff；联合验证等待底层 GREEN | 已交接并停止写入，主任务随后接管局部 CSS 集成 |
| 当前协调任务 | 当前模型 | `PLANS.md`、开发及验收文档、`.dev-runtime/image-splitter/` 验收材料；交接后局部 CSS 修正 | 所有实现 | 实现、当前环境验收与交付记录完成 |

每个后台任务可写自己的 `.dev-runtime/image-splitter/<任务名>/` 证据目录，不修改共用状态文件。

最终集成转交：三个工作任务均已交接停止写入，浏览器任务与界面任务的状态为 idle，核心任务也为 idle 且 handoff 明确停止。主任务从此接管 `ImageSplitterTool.css` 的一处有界预览修正，不修改冻结 API，不再有并行写入者。界面第二轮主要交互均通过，但极窄横向片的单片滚动会越过裁切边界且滚动条挤占图像宽度；缩小剩余范围并串行集成，避免重新开启整套界面实现。

响应式终检继续在同一 CSS 归属内修正：390px 实际视口中，自由编辑区的 `max-content` 与隐式 grid 列让页面滚动宽度达到 834px。改为明确的 `minmax(0, 1fr)` 列约束，编辑区宽度同时受容器宽和按源图比例换算的最大高度限制，图片与下方滑条共享此宽度。保留复现 `qa/mobile-overflow-before.json` 与修改前 CSS，不改 TypeScript 或既定交互。

截图收尾时主任务另接管 `ImageSplitterTool.tsx` 中预览容器的一个样式属性：传入本行切片总宽高比及 3px 间距总和，让普通三片在手机可用宽度内等比缩小。CSS 用容器宽度计算共同预览高度并保留可读下限，极窄片及大量切片仍可内部滚动；不支持容器单位时保持原滚动兼容路径。不改事件、状态、裁切坐标或导出代码，无其他写入者。

## 验收记录

实现和当前环境验收已完成。最终结果以 [验收记录](image-splitter-validation.md) 为准，以下保留各轮问题与修正证据。手机触摸、相册和原生目录等未运行层继续保留 DEFERRED。

- 独立几何验收已通过：枚举 82,126 次小尺寸有序切线的合法拖动解，含不对称/对称/无解；两方向逐像素覆盖恰好一次。日志 `.dev-runtime/image-splitter/qa/geometry-oracle.log`，最终集成后复跑。
- 既有额外回归 21/21 通过，合计基线 53/53；日志 `.dev-runtime/image-splitter/baseline-extra-tests.log`。
- 桌面浏览器能力检测：ImageBitmap、HTMLImage.decode、OffscreenCanvas、文件分享、目录及单文件 picker 均存在；这不是实际保存成功证据。
- 用户中断后续作：原两个工作任务的 turn 为 interrupted，保留原任务/文件归属继续，不计作实现失败；中断时界面任务尚未建立。
- 核心数值边界修正后，核心与独立几何检查合计 23/23 通过；拒绝不安全整数，安全整数等分使用精确运算。证据 `.dev-runtime/image-splitter/qa/core-current.log`。
- 浏览器第一轮实际 49 项中 41 项通过，失败均为 HTMLImage EXIF1–8 后备。第一次修正原尺寸 source Canvas 后宽高恢复，但仍为 41/49；保留两个结果 JSON，未修改像素断言。独立诊断枚举 96 个绘制组合，定位为 Chromium 默认 GPU Canvas 的 JPEG 栅格误差：启用 `willReadFrequently` 的 CPU Canvas 全部与定向参考逐像素一致，默认 GPU 路径最大通道误差 53。证据为 `qa/canvas-expanded-first.json`、`qa/canvas-after-fallback-fix.json`、`qa/decoder-diagnostic.json`。该门槛连续两次未通过，原浏览器任务升级为 Sol / xhigh 完成修正，主任务不越界写实现。
- 界面第一轮退回修正：range 相互遮挡、图片与轨道错位、拖动/异步 ZIP 生命周期、自定非法值恢复、极窄分片图像实际间隔、隐藏文件输入及短轴显示。保存结果总数使用适配器的 `attempted`，不假设 `total`。截图与命中记录在 `qa/ui-initial-desktop.png`、`qa/ui-first-slider.json`。
- 系统窗口验收尝试：Computer Use 拒绝操作 Codex 应用，返回安全限制，未绕过限制或另开原生保存对话框。因此实际桌面系统目录选择/写入暂列 `DEFERRED_NATIVE_PICKER`；继续完成页面下载、文件内容及适配器行为验证。
- 后备 Canvas 明确使用 CPU 原尺寸绘制后，真实套件 **49/49 通过**，包含全部 EXIF 后备用例；未放宽任何像素断言。结果 `qa/canvas-final.json`。
- 真实单张和批量 ZIP 下载已在 `~/Downloads/` 获得文件；复制到本地验收目录并独立核对 PNG 尺寸、ZIP 条目顺序、CRC，以及全部文件与浏览器预生成 File 的 SHA-256 一致。证据为 `qa/single-disk-validation.json`、`qa/zip-disk-validation.json`；这不等同于目录选择器或手机相册保存。浏览器工具的 download 事件等待超时，但磁盘实物证明下载已发生，因此没有把工具超时误判为应用导出失败。
- 当前项目 Node 回归 **95/95 通过**；UI 修正完成后再跑一次最终检查。日志 `qa/regression-current.log`。
- 界面第二轮实测：第一滑块鼠标独立拖动、源像素键盘步进、对称开关不跳动、成对移动、中间切线独立、模式恢复、非法数量恢复、有效自定、无解提示、横向映射均通过。证据 `qa/ui-behavior-current.json`。项目回归更新为 97/97，定向检查 145 个源文件仍只有既有 Speech 错误。
- 剩余预览样式缺口的复现：1×19 图横向分成 3 片，以 88px 宽显示时应分别高 528/528/616px；旧独立滚动框的可滚动内容却为 1672/1144/616px，且 88px 列只剩 71px 图像区域。`qa/compact-before.json` 保存真实 DOM 证据。集成方案是移除单片滚动，以真实裁切框硬裁切、外层预览统一滚动；长片保存按钮在自身列内吸附视窗下缘。`qa/sticky-layout.html` 已验证按钮可见且不重叠。

真实 iOS/Android 相册保存、真实系统来源菜单与大图内存表现暂列 `DEFERRED`，不得以模拟手机视口通过替代。桌面真实目录写入也独立记录。

最终收口：99 项 Node／独立几何测试和 49 项实际 Canvas 检查通过；4MP 实际下载 ZIP 的 7 张 PNG 重拼后逐像素相等。局部 CSS 修正后，360/390 手机视口、1280/1440 桌面、844 横屏及三语无整页横向溢出，32 张只在预览区内部滚动。生产源站停止且直接连接失败后，三语缓存页面可重载，并可重新选图、切分和准备导出文件。最终构建、offline/PWA 和 diff 检查通过；源码类型检查仍只有开发前已有的 Speech 错误。临时生产与 QA 服务在验收后停止，仅保留用户可访问的开发预览。
