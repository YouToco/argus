# Argus 👁️

前端本地「长视频理解」agent harness。视频完全在浏览器本地处理，**无后端**；用户自己填写任意 LLM provider 的 API Key / Base URL / 模型，agent 通过一组工具完成抽帧观察、状态记忆与子代理分工，最终给出带证据的结论。

名字取自希腊神话百眼巨人 **Argus Panoptes**（全视守望者）——正好对应「盯着监控画面数人、找物」的场景。

## 特性

- **纯前端、零后端**：视频通过本地 Object URL 加载，不出浏览器；帧提取走原生 `<video>` + `<canvas>` 硬件解码，不依赖 FFmpeg/WASM 重编码。
- **多 provider 一个 SDK**：基于 [Vercel AI SDK](https://ai-sdk.dev)，同一套代码支持：
  - **OpenAI 兼容端点**（可自定义 baseURL → OpenAI / OpenRouter / DeepSeek / Kimi / 智谱 / Ollama …）
  - **Anthropic**（自动附加 `direct-browser-access` 头，支持浏览器直连）
  - **Google Gemini**（浏览器直连）
- **专业 agent loop + 工具集**：
  - `get_video_info` — 容器/编码/大小/时长/分辨率/帧率/码率（mediainfo.js，懒加载）
  - `extract_frames` — 按【时间范围 + 间隔】抽帧，支持精度控制（`max_width`/`quality`/`max_frames`）
  - `extract_frame_at` — 抽指定时刻单帧
  - `list_frames` — 列出已抽帧及 id
  - `inspect_region` — 放大某帧局部区域（找远处物体/人物）
  - `remember` / `recall` — 状态记忆，避免长上下文遗忘
  - `spawn_subagent` — 把长片段细看交给子代理，避免主上下文被帧图撑爆
- **必要时重新抽帧**：agent 发现某段时间凭状态信息无法定论时，会用更小间隔 / 更高精度重新抽帧细看。
- **凭证只存本机**：API Key 与配置只存浏览器 `localStorage`，请求由浏览器直发你填写的端点，不经任何中间服务器。

## 本地开发

```bash
npm install
npm run dev        # 启动 Vite 开发服务器
npm run build      # 类型检查 + 生产构建（产物在 dist/）
npm run preview    # 预览生产构建
```

打开页面 → 右上角「模型配置」填 API Key / Base URL / 模型 → 左侧加载本地视频 → 输入需求开始分析。

## 多 provider 说明（CORS）

浏览器直连 LLM API 受各家 CORS 策略约束：

| Provider | 浏览器直连 | 说明 |
|---|---|---|
| OpenAI 官方 | ❌ | 官方 API 拦截浏览器跨域，请改用兼容端点 |
| OpenRouter / DeepSeek / Kimi / 智谱 / Groq 等 | ✅ | 走「OpenAI 兼容」类型，填对应 baseURL |
| Anthropic | ✅ | 已自动附加 direct-browser-access 头 |
| Google Gemini | ✅ | 原生支持 |

> 视觉分析需要**多模态模型**（如 `gpt-4o`、`qwen-vl-max`、`claude-sonnet-4`、`gemini-2.5-flash`）。

## 部署架构（双线）

与 [zhuoqidev.com](https://github.com/YouToco/zhuoqidev.com) 相同：

- **国内流量** → 阿里云 CDN → OSS（`oss-cn-shenzhen`）
- **海外流量** → Cloudflare Pages
- DNS 分线路由：`default`（国内）→ 阿里 CDN，`oversea`（海外）→ Cloudflare Pages
- 自动化：GitHub Actions，push 到 `main` 即构建 `dist/` 并双线发布

详见 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)。

## 项目结构

```
src/
├── lib/
│   ├── providers.ts        # 多 provider 模型工厂（Vercel AI SDK）
│   ├── settings.ts         # localStorage 配置持久化
│   ├── format.ts           # 时长/字节/码率格式化
│   ├── video/
│   │   ├── session.ts      # VideoSession：视频加载 + 抽帧（video+canvas）
│   │   └── inspect.ts      # 局部区域放大
│   └── agent/
│       ├── harness.ts      # agent loop（手动工具循环 + 子代理）
│       ├── tools.ts        # 工具注册表
│       └── memory.ts       # 状态记忆
├── components/             # React UI
├── store.ts                # zustand 状态
└── App.tsx
```
