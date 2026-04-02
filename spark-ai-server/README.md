# SPARK AI Server

Java Spring Boot 后端，实现 `POST /api/ai/chat`，接收 SPARK View 前端的 AI 闭环请求，调用 LLM 生成页面配置，返回 `AIResponse`。

## 数据目录约定

- 页面配置与组件元数据位于 `spark-ai-server/data/`。
- 当前正式页面配置路径是 `spark-ai-server/data/pages-config/`。
- 仓库根目录若出现单独的 `data/` 目录，应视为本地运行态残留或误生成物，不作为现行结构依据。

## 前提条件

- Java 17+
- Maven 3.8+（或使用 `./mvnw` wrapper）
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
cd spark-ai-server
mvn spring-boot:run
```

服务启动后监听 `http://localhost:8080`。

### 3. 启用 Vite 代理（接入前端）

在 SPARK_VIEW 根目录创建 `.env.local` 文件（已在 `.gitignore` 中）：

```
# 取消注释以将 /api/ai 请求转发到 Java 服务
AI_BACKEND_URL=http://localhost:8080
```

然后重启 Vite 开发服务器（`pnpm run dev`）。此后前端的 AI Studio 页面将使用真实 LLM 生成。

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

### `POST /api/ai/chat`

**请求体（generate）：**
```json
{
  "action": "generate",
  "pageId": "my-page",
  "prompt": "生成一个订单管理页面，包含订单列表、金额汇总",
  "sessionId": "session-abc"
}
```

**请求体（iterate）：**
```json
{
  "action": "iterate",
  "pageId": "my-page",
  "sessionId": "session-abc",
  "feedback": "请把表格改成带斑马纹，并添加创建时间列",
  "currentFiles": {
    "rule.json": "...",
    "pagedata.json": "..."
  },
  "logs": [
    { "timestamp": 1700000000000, "level": "error", "message": "Table xxx has no API" }
  ]
}
```

**响应：**
```json
{
  "files": {
    "rule.json": "[{\"type\":\"r-table\",...}]",
    "pagedata.json": "{\"dataSetName\":\"my-page\",...}",
    "script.js": "function __init__() { ... }",
    "style.css": ""
  },
  "explanation": "生成了包含5列的订单管理表格，头部有搜索栏",
  "needsIteration": false
}
```

---

## 打包部署

```bash
mvn clean package -DskipTests
java -jar target/spark-ai-server-1.0.0.jar
```

生产环境建议通过环境变量或 Kubernetes Secret 注入 API Key，不要将 Key 写入配置文件。
