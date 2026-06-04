# SPARK AI Server

Java Spring Boot 后端，当前主要承载三类能力：统一 AI 会话接口 `/api/ai/sessions/*`、APP 公共 SSE 通道 `/api/events`、以及页面配置/导航/调试等平台后端能力。

## 数据目录约定

- 页面配置与组件元数据位于 `spark-ai-server/data/`。
- 当前正式页面配置路径是 `spark-ai-server/data/pages-config/`。
- 仓库根目录若出现单独的 `data/` 目录，应视为本地运行态残留或误生成物，不作为现行结构依据。

## 前提条件

- Java 17+
- Maven 3.8+（或使用 `./mvnw` wrapper）
- Docker Desktop（项目数据库使用 Docker MySQL，端口为 `3406`）
- 有效的 OpenAI API Key（或其他兼容端点的 Key）

## 快速启动

### 1. 设置 API Key

**Windows PowerShell：**
```powershell
$env:OPENAI_API_KEY = "sk-xxxxxxxxxxxxxxxx"
```

**Linux / macOS：**
```bash
export OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxx"
```

**推荐：本地 `.env.java` 文件（不会提交到 git）**

在仓库根目录创建 `.env.java`，或放在 `spark-ai-server/.env.java`：

```ini
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
AI_MODEL=deepseek-chat
# AI_JSON_MODE=true
```

项目已提供示例文件 [\.env.java.example](..%2F.env.java.example)。
`scripts/start-dev.mjs` 和 `scripts/build-all.mjs` 会自动读取该文件，且进程级环境变量优先级更高。

### 2. 编译并运行

```bash
docker compose -f spark-ai-server/docker-compose.yml up -d mysql

cd spark-ai-server
mvn spring-boot:run
```

服务启动后监听 `http://localhost:8180`。

如果从仓库根目录执行 `pnpm run dev` 或 `pnpm run build`，脚本会先自动确认上述 Docker MySQL 已启动；只有手动直接跑 Maven 时需要先执行 `docker compose ... up -d mysql`。

### 3. 启用 Vite 代理（接入前端）

在 SPARK_AppWorks 根目录创建 `.env.local` 文件（已在 `.gitignore` 中）：

```
# 取消注释以将 /api/ai 请求转发到 Java 服务
AI_BACKEND_URL=http://localhost:8180
```

然后重启 Vite 开发服务器（`pnpm run dev`）。此后基于 stills 的编辑会话会走真实后端；模型事件通过 APP 公共 `/api/events` SSE 通道返回。

---

## 使用其他 LLM

### 本地 Ollama

1. 安装 [Ollama](https://ollama.ai) 并拉取模型：
   ```bash
   ollama pull qwen2.5:7b
   ```

2. 修改 `application.yml`（或设置环境变量）：
   ```yaml
   spark.ai.openai:
     base-url: http://localhost:11434
     api-key: ollama          # Ollama 不校验 Key，随意填
     model: qwen2.5:7b
     json-mode: false         # 大多数本地模型不支持 JSON 模式
   ```

   或环境变量方式：
   ```powershell
   $env:OPENAI_BASE_URL = "http://localhost:11434"
   $env:OPENAI_API_KEY  = "ollama"
   $env:AI_MODEL        = "qwen2.5:7b"
   $env:AI_JSON_MODE    = "false"
   ```

### DeepSeek

```powershell
$env:OPENAI_BASE_URL = "https://api.deepseek.com"
$env:OPENAI_API_KEY  = "sk-your-deepseek-key"
$env:AI_MODEL        = "deepseek-chat"
```

### 阿里通义千问

```powershell
$env:OPENAI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode"
$env:OPENAI_API_KEY  = "sk-your-dashscope-key"
$env:AI_MODEL        = "qwen-plus"
```

---

## API 接口

### `/api/ai/sessions/*`

统一会话接口，供 stills / FC 会话编排使用。`POST /api/ai/turns` 是 HTTP 启动命令，返回 accepted ACK；`llm-frame` 模型事件统一通过 `/api/events` 下发。

| Method | Path | 说明 |
|---|---|---|
| `POST` | `/api/ai/sessions` | 创建会话 |
| `POST` | `/api/ai/sessions/{sessionId}/turn` | 非流式执行一轮 |
| `POST` | `/api/ai/turns` | 启动一轮模型调用，返回 HTTP ACK，结果走 APP SSE `llm-frame` |
| `POST` | `/api/ai/sessions/{sessionId}/turn/append` | 按 turn 追加 assistant/tool 消息 |
| `POST` | `/api/ai/sessions/{sessionId}/append` | 追加消息 |
| `GET` | `/api/ai/sessions/{sessionId}/conversation` | 获取完整会话历史 |
| `DELETE` | `/api/ai/sessions/{sessionId}` | 销毁单个会话 |
| `DELETE` | `/api/ai/sessions` | 批量销毁当前会话 |

### 其他 AI 相关端点

| Method | Path | 说明 |
|---|---|---|
| `POST` | `/api/ai/upload` | 上传聊天附件 |
| `POST` | `/api/ai/component-metadata` | 上传组件元数据 |
| `GET` | `/api/ai/component-metadata` | 查询组件元数据状态 |
| `POST` | `/api/ai/debug/screenshot-request` | 触发截图调试请求 |
| `POST` | `/api/ai/debug/screenshot-result` | 回传截图调试结果 |
| `POST` | `/api/ai/debug/route-request` | 触发路由调试请求 |
| `POST` | `/api/ai/debug/route-result` | 回传路由调试结果 |

### `GET /api/events`

APP 唯一 SSE 通道。页面配置、数据任务、通知、AI 调试事件和 AI turn 模型事件都通过这里广播；当前 AI turn 主链路使用 `llm-frame` 中性帧事件，旧 `ai-turn-*` 名称仅保留在历史/兼容会话接口中。

---

## 打包部署

```bash
mvn clean package -DskipTests
java -jar target/spark-ai-server-1.0.0.jar
```

生产环境建议通过环境变量或 Kubernetes Secret 注入 API Key，不要将 Key 写入配置文件。
