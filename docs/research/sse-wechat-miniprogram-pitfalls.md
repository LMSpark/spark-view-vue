# 微信小程序 SSE 实现与「模拟器正常、真机失败」完整分析

> 2026-06-12 调研整理，供团队传阅。

---

## 一、模拟器 vs 真机差异根源

| 维度 | 模拟器（开发者工具） | 真机 |
|------|:---:|:---:|
| **运行时** | 完整 Chrome V8 内核 | 阉割版 JSCore（iOS） / V8 x5（Android） |
| **`EventSource`** | ✅ 存在 | ❌ `is not defined` |
| **`TextDecoder`** | ✅ 存在 | ❌ `is not defined` |
| **HTTPS 校验** | 可关闭 | 强制要求（可临时勾"不校验域名"） |
| **HTTP/2** | 正常 | 配合 Chunked 响应容易崩溃 |
| **`127.0.0.1`** | 可用 | ❌ 必须局域网 IP 或已备案域名 |
| **分块大小** | 无限制 | 强制 **16360 字节/片** 截断 |

---

## 二、核心原因逐条拆解

### 1. 无 `EventSource` API

微信小程序不是完整浏览器，没有实现 W3C SSE 标准。真机直接报 `EventSource is not defined`。仅开发者工具内置 Chrome 内核才能用。

### 2. 无 `TextDecoder` API

这是中文乱码的**头号元凶**。流式数据是 `ArrayBuffer`，真机无法用 `new TextDecoder('utf-8').decode()`，报错后整个解析链断裂。

### 3. HTTP/2 + Chunked = 崩溃

微信客户端对 HTTP/2 分块传输处理有 bug，连接不定时断开或数据不完整。**禁用 HTTP/2 走 HTTP/1.1 是最稳方案**。

### 4. 16360 字节硬截断

微信底层 `onChunkReceived` 回调每片最大 **16360 字节**，一段完整的 JSON 可能被切到两个 chunk 里，不处理拼接的话 `JSON.parse` 必定报错。

### 5. 网络层差异

- `127.0.0.1` 在真机上被微信沙箱隔离，必须用局域网 IP
- 开发机 HTTPS 证书非 CA 签发会被真机拒绝（可临时开启"不校验域名"）

---

## 三、完整解决方案（工业级实现）

### 3.1 核心 API：`wx.request` + `enableChunked`

```typescript
// ✅ 微信小程序 SSE 标准实现
const requestTask = wx.request({
  url: 'https://your-api.com/stream',
  method: 'POST',
  enableChunked: true,        // 🔑 关键
  enableHttp2: false,          // 🔑 禁用 HTTP/2
  responseType: 'arraybuffer',
  header: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream'
  }
})

// 流式回调
requestTask.onChunkReceived((res: WechatMiniprogram.OnChunkReceivedCallbackResult) => {
  processSSEChunk(res.data) // res.data 是 ArrayBuffer
})
```

### 3.2 UTF-8 解码（零依赖，无 TextDecoder）

```typescript
/**
 * UTF-8 ArrayBuffer → 字符串，零依赖，真机可用。
 *
 * 原理：escape() 将多字节序列（如中文"你" → 字节 E4 BD A0）
 * 转成 %E4%BD%A0，decodeURIComponent() 再解码回 UTF-8。
 */
function decodeUtf8(buffer: ArrayBuffer): string {
  const u8a = new Uint8Array(buffer)
  const text = String.fromCharCode.apply(null, Array.from(u8a))
  return decodeURIComponent(escape(text))
}
```

备选方案（如需保持 Web 标准 API 语义）：

| 库 | 体积 | 备注 |
|----|------|------|
| `text-encoding-shim` | ~20KB | TextDecoder 完整 polyfill |
| `mp-text-decoder` | ~2KB | 专为小程序场景裁剪 |

### 3.3 SSE 分段解析 + 缓冲区拼接

```typescript
class SSEParser {
  private buffer = ''

  /**
   * 喂入新原始数据，返回本批次解析出的完整消息（payload 数组）。
   * 跨 chunk 截断的不完整消息留在内部缓冲区等待后续数据。
   */
  feed(raw: string): string[] {
    this.buffer += raw
    const messages: string[] = []

    // 按 \n\n 切分完整 SSE 消息
    while (this.buffer.includes('\n\n')) {
      const idx = this.buffer.indexOf('\n\n')
      const block = this.buffer.slice(0, idx)
      this.buffer = this.buffer.slice(idx + 2)

      // 提取 data: 行
      const lines = block.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6)
          if (payload === '[DONE]') return messages // 流终止标记
          messages.push(payload)
        }
      }
    }
    return messages
  }

  /** 返回缓冲区中尚未组装完成的残留数据（用于调试） */
  get residue(): string {
    return this.buffer
  }
}
```

### 3.4 完整请求流程组合

```typescript
function sseRequest(
  url: string,
  body: Record<string, unknown>,
  onMessage: (json: unknown) => void
) {
  const parser = new SSEParser()

  const task = wx.request({
    url,
    method: 'POST',
    enableChunked: true,
    enableHttp2: false,
    responseType: 'arraybuffer',
    header: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    data: body
  })

  task.onChunkReceived((res) => {
    const raw = decodeUtf8(res.data)
    const payloads = parser.feed(raw)
    for (const payload of payloads) {
      try {
        onMessage(JSON.parse(payload))
      } catch {
        // JSON 被截断时跳过，等待下一 chunk
        console.warn('[SSE] parse skip, residue:', parser.residue.length)
      }
    }
  })

  return task // 调用方可 .abort()
}
```

### 3.5 Nginx 服务端配置

```nginx
location /api/stream {
    proxy_buffering off;        # 🔑 关闭缓冲，立即转发
    proxy_cache off;
    gzip off;                   # 🔑 关闭压缩（会导致分块边界错乱）
    proxy_http_version 1.1;     # 🔑 强制 HTTP/1.1
    proxy_set_header Connection '';
    chunked_transfer_encoding on;
    proxy_read_timeout 24h;     # 超长连接
}
```

---

## 四、排查清单

| 检查项 | 预期 |
|--------|------|
| 是否改用 `wx.request` + `enableChunked` | ✅ 不用 `EventSource` |
| 是否设置 `enableHttp2: false` | ✅ |
| 是否使用 UTF-8 解码替代方案 | ✅ 不用 `TextDecoder` |
| 是否有跨 chunk 缓冲区拼接 | ✅ 应对 16360 字节截断 |
| 是否用局域网 IP 代替 `localhost` | ✅ 192.168.x.x |
| 服务端 Nginx `proxy_buffering off` | ✅ |
| 服务端 `gzip off`（SSE 路径） | ✅ |
| iOS 真机是否开启开发者模式 | ✅ iOS 16+ 设置 → 隐私与安全性 |

---

## 五、真机开发调试速查

| 操作 | 路径 |
|------|------|
| 启用"不校验合法域名" | 微信开发者工具 → 详情 → 本地设置 |
| 获取本机局域网 IP | `ipconfig`（Win）/ `ifconfig`（Mac）→ 替换 `localhost` |
| iOS 真机调试 | 开启「开发者模式」（iOS 16+：设置 → 隐私与安全性） |
| Android 真机调试 | USB 调试 + 微信开发者工具「预览」扫码 |

---

## 参考来源

- [Taro + 微信小程序实现大模型流式响应（SSE）](https://juejin.cn/post/7575367791273639974)
- [解决微信小程序真机 TextDecoder 流式解析失败指南](https://juejin.cn/post/7546053362468421641)
- [微信小程序与 SSE 流数据接收实现](https://blog.csdn.net/wjianwei666/article/details/151396856)
- [记一次微信小程序 AI 开发的血泪史](https://juejin.cn/post/7524732017956339762)
- [不同开发场景下处理 SSE 数据的方法](https://blog.csdn.net/chaoxxggg/article/details/149785166)
- [原生小程序如何实现稳定的 SSE 长连接并处理断线重连](https://ask.csdn.net/questions/9254909)
- [mp-text-decoder](https://www.npmjs.com/package/mp-text-decoder)
