<div align="center">

# Argus

**前端本地的长视频理解 Agent Harness —— 视频不出浏览器，结论必带证据**

Frontend-local long-video understanding agent harness. No backend, no uploads — your video never leaves the browser.

[![Deploy](https://github.com/YouToco/argus/actions/workflows/deploy.yml/badge.svg)](https://github.com/YouToco/argus/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![Vercel AI SDK](https://img.shields.io/badge/Vercel%20AI%20SDK-5-black.svg)](https://ai-sdk.dev)

[在线体验](https://argus.zhuoqidev.com) · [快速开始](#快速开始) · [工作原理](#工作原理) · [测试](#测试)

</div>

---

名字取自希腊神话百眼巨人 **Argus Panoptes**（全视守望者）。你给 Argus 一段本地视频和一句话需求——"数一下这段监控里有几个人""找出红色物品出现的时间"——它会自己规划抽帧策略、逐段观察、记录状态、必要时派子代理细看，最后给出**带关键帧时间戳证据**的结论。

![主页](docs/screenshots/home-empty.jpg)

## 特性

- **纯前端、零后端**：视频经本地 Object URL 加载，帧提取走原生 `<video>` + `<canvas>` 硬件解码，不依赖 FFmpeg/WASM 重编码，文件从不上传。
- **BYOK 多 provider**：基于 [Vercel AI SDK](https://ai-sdk.dev)，一套代码支持 OpenAI 兼容端点（OpenRouter / DeepSeek / Kimi / 智谱 / Ollama …）、Anthropic、Gemini；填完 API Key **自动拉取端点模型列表**，下拉即选。
- **专业 Agent 工作流**：粗扫 → 锁定区间 → 加密细看 → 放大确认的分层策略；`remember/recall` 状态记忆防长上下文遗忘；`spawn_subagent` 把长片段派给子代理并行细看。
- **过程可视化**：回答上方是可折叠的工作过程区——每个工具调用的参数摘要、结果、状态一目了然，子代理步骤嵌套展示；回答用 Markdown 渲染。
- **本地持久化**：分析会话（对话 / 帧 / 记忆）自动存入 IndexedDB，刷新不丢；历史记录支持单条恢复、单条删除、一键清空。
- **长视频内存治理**：内存只保留最近 200 帧（旧帧从 IndexedDB 懒加载）；发给模型的上下文只保留最近 3 批帧图，更早的替换为可回查的文字指针——小时级视频不会撑爆标签页内存或上下文窗口。
- **凭证不出本机**：API Key 只存浏览器 localStorage，请求由浏览器直发你填写的端点。

## 使用过程

| 分析回答（Markdown + 证据帧条） | 工作过程区（90 步工具调用可审计） |
| --- | --- |
| ![分析回答](docs/screenshots/analysis-answer.jpg) | ![过程区](docs/screenshots/process-expanded.jpg) |

| 子代理并行细看（28 个子步骤嵌套） | 模型配置（自动拉取模型列表） |
| --- | --- |
| ![子代理](docs/screenshots/subagent-trace.jpg) | ![配置弹窗](docs/screenshots/config-dialog.jpg) |

| 历史记录（恢复 / 单删 / 清空） |
| --- |
| ![历史记录](docs/screenshots/history-panel.jpg) |

## 快速开始

**在线版**：打开 [argus.zhuoqidev.com](https://argus.zhuoqidev.com)，右上角填入任意 provider 的 API Key，左侧拖入本地视频即可。

**本地开发**：

```bash
npm install
npm run dev        # Vite 开发服务器
npm test           # vitest 单元测试
npm run typecheck  # tsc --noEmit
npm run build      # 类型检查 + 生产构建（产物在 dist/）
```

推荐使用带视觉能力的模型（如 `deepseek-v4-flash-vision-exp`、`gpt-4o`、`gemini-2.5-flash`、`qwen-vl-max`）——纯文本模型看不到帧图，无法完成分析。

## 工作原理

```
用户需求 → 主 Agent（系统提示 + 工具集）
  ├─ get_video_info    容器/编码/时长/分辨率/帧率（mediainfo.js 懒加载）
  ├─ extract_frames    按【时间范围 + 间隔】批量抽帧（精度/数量可控）
  ├─ extract_frame_at  抽指定瞬间单帧
  ├─ list_frames       列出已抽帧及 id
  ├─ inspect_region    放大某帧局部区域（确认远处物体细节）
  ├─ remember / recall 时间段观察结论的写入与回读（状态工具）
  └─ spawn_subagent    把某时间段的细看派给子代理 → 返回精简结论
         └─ 子代理继承除 spawn 外的全部工具，独立抽帧观察
```

每轮工具产出的帧图注入对话供模型直接观察；旧帧图在上下文中按批裁剪（保留最近 3 批），模型随时可通过 `list_frames` / `extract_frame_at` 回查任意帧。

## 测试

- **单元测试**：`npm test`（vitest）—— 记忆存储、上下文帧图裁剪等核心逻辑。
- **真值视频集**：`public/gen-test-video.html` 可在浏览器里一键生成 5 段带精确真值的合成视频（物体运动 / 计数变化 / OCR / 1 秒瞬态事件 / 3 分钟稀疏事件），用于端到端验证 agent 的真实理解力——本项目所有结论都对真值验证过（计数变化边界 0.1s 级、180s 稀疏事件全召回零幻觉、4 子代理并行编排）。

## 隐私

视频文件、API Key、分析记录全部留在本机（localStorage + IndexedDB）；唯一的网络请求是从浏览器直发你配置的 LLM 端点。清空历史记录即彻底删除本地数据。

## License

[MIT](LICENSE)