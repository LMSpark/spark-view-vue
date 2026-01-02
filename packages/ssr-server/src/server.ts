/**
 * SSR 服务器
 * 基于 Express，支持缓存和流式渲染
 */

import express, { Request, Response } from 'express';
import { SSRRenderer } from './render';
import { CacheAdapter, MemoryCache } from './cache';
import fs from 'fs/promises';
import path from 'path';

export interface SSRServerOptions {
  port?: number;
  cache?: CacheAdapter;
  dslDir?: string;
}

export class SSRServer {
  private app: express.Application;
  private renderer: SSRRenderer;
  private cache: CacheAdapter;
  private dslDir: string;

  constructor(private options: SSRServerOptions = {}) {
    this.app = express();
    this.renderer = new SSRRenderer();
    this.cache = options.cache || new MemoryCache();
    this.dslDir = options.dslDir || './dsls';

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.static('public'));
  }

  private setupRoutes(): void {
    // 健康检查
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', uptime: process.uptime() });
    });

    // 渲染 DSL（通过 ID）
    this.app.get('/render/:dslId', async (req, res) => {
      await this.handleRender(req, res);
    });

    // 渲染 DSL（通过 POST body）
    this.app.post('/render', async (req, res) => {
      await this.handleRenderPost(req, res);
    });

    // 清除缓存
    this.app.post('/cache/clear', async (req, res) => {
      await this.cache.clear();
      res.json({ success: true });
    });
  }

  /**
   * 处理 GET /render/:dslId
   */
  private async handleRender(req: Request, res: Response): Promise<void> {
    const { dslId } = req.params;
    const cacheKey = `dsl:${dslId}`;

    try {
      // 尝试从缓存获取
      const cachedHtml = await this.cache.get(cacheKey);
      if (cachedHtml) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(cachedHtml);
        return;
      }

      // 读取 DSL 文件
      const dslPath = path.join(this.dslDir, `${dslId}.yaml`);
      const dslContent = await fs.readFile(dslPath, 'utf-8');

      // 渲染
      const { html, hydrationHints, criticalCSS } = await this.renderer.render(dslContent);

      // 生成完整 HTML
      const fullHtml = this.wrapHtml(html, hydrationHints, criticalCSS);

      // 缓存（TTL 60秒，可配置）
      await this.cache.set(cacheKey, fullHtml, 60);

      res.setHeader('X-Cache', 'MISS');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(fullHtml);
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`Render error for ${dslId}:`, error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 处理 POST /render（DSL 内容在 body 中）
   */
  private async handleRenderPost(req: Request, res: Response): Promise<void> {
    const { dsl, context } = req.body;

    if (!dsl) {
      res.status(400).json({ error: 'Missing dsl in request body' });
      return;
    }

    try {
      const { html, hydrationHints, criticalCSS } = await this.renderer.render(dsl, context);
      const fullHtml = this.wrapHtml(html, hydrationHints, criticalCSS);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(fullHtml);
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Render error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 包装 HTML（添加 head, hydration script 等）
   */
  private wrapHtml(html: string, hydrationHints: unknown[], criticalCSS?: string): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SPARK.View SSR</title>
  ${criticalCSS ? `<style>${criticalCSS}</style>` : ''}
  <script>
    // 注入水合提示到全局
    window.__HYDRATION_HINTS__ = ${JSON.stringify(hydrationHints)};
  </script>
</head>
<body>
  <div id="app">${html}</div>
  <script type="module" src="/runtime.js"></script>
</body>
</html>`;
  }

  /**
   * 启动服务器
   */
  listen(): void {
    const port = this.options.port || 3000;
    this.app.listen(port, () => {
      console.log(`SSR Server listening on http://localhost:${port}`);
      console.log(`DSL directory: ${path.resolve(this.dslDir)}`);
    });
  }

  /**
   * 获取 Express app（用于测试）
   */
  getApp(): express.Application {
    return this.app;
  }
}

/**
 * 便捷导出
 */
export function createSSRServer(options?: SSRServerOptions): SSRServer {
  return new SSRServer(options);
}
