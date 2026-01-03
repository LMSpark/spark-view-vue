import express, { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { CacheManager } from './cache';
import { DslStorage } from './storage';
import { Parser } from '@spark-view/dsl-parser';
import { Compiler } from '@spark-view/dsl-compiler';
import { SSRRenderer } from '@spark-view/ssr-server';

export interface ApiServerOptions {
  port?: number;
  redisUrl?: string;
  cacheTtl?: number;
}

export class ApiServer {
  private app: express.Application;
  private cache: CacheManager;
  private storage: DslStorage;
  private parser: Parser;
  private compiler: Compiler;
  private renderer: SSRRenderer;
  private cacheTtl: number;

  constructor(options: ApiServerOptions = {}) {
    this.app = express();
    this.cache = new CacheManager(options.redisUrl);
    this.storage = new DslStorage();
    this.parser = new Parser();
    this.compiler = new Compiler();
    this.renderer = new SSRRenderer();
    this.cacheTtl = options.cacheTtl || 3600;

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });
  }

  private setupRoutes() {
    // 健康检查
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // SSR渲染接口 - 混合架构核心
    this.app.get('/api/render',
      query('dslId').notEmpty(),
      query('path').notEmpty(),
      this.handleValidation,
      this.renderPage.bind(this)
    );

    // DSL管理接口
    this.app.post('/api/dsl',
      body('id').notEmpty(),
      body('dsl').notEmpty(),
      this.handleValidation,
      this.saveDsl.bind(this)
    );

    this.app.get('/api/dsl/:id',
      param('id').notEmpty(),
      this.handleValidation,
      this.getDsl.bind(this)
    );

    this.app.put('/api/dsl/:id/pages/:pageId',
      param('id').notEmpty(),
      param('pageId').notEmpty(),
      body('data').notEmpty(),
      this.handleValidation,
      this.updatePage.bind(this)
    );

    this.app.delete('/api/dsl/:id',
      param('id').notEmpty(),
      this.handleValidation,
      this.deleteDsl.bind(this)
    );

    this.app.get('/api/dsl', this.listDsl.bind(this));

    // 缓存管理接口
    this.app.post('/api/cache/invalidate/:dslId',
      param('dslId').notEmpty(),
      this.handleValidation,
      this.invalidateCache.bind(this)
    );
  }

  /**
   * SSR渲染 - 返回首屏HTML + 完整路由配置 + 懒加载组件
   */
  private async renderPage(req: Request, res: Response) {
    try {
      const { dslId, path } = req.query as { dslId: string; path: string };

      // 1. 检查路由配置缓存
      let routerConfig = await this.cache.getRouterConfig(dslId);
      
      // 2. 检查当前页面缓存
      const pageId = this.extractPageIdFromPath(path);
      let pageHtml = await this.cache.getPage(dslId, pageId);

      // 3. 如果缓存未命中，执行编译
      if (!routerConfig || !pageHtml) {
        const dsl = await this.storage.get(dslId);
        if (!dsl) {
          return res.status(404).json({ error: 'DSL not found' });
        }

        // 编译当前页面（SSR首屏）
        const renderResult = await this.renderer.render(JSON.stringify(dsl), { routePath: path });
        pageHtml = renderResult.html;

        // 解析DSL用于编译路由配置
        const ast = this.parser.parse(JSON.stringify(dsl));
        
        // 编译路由配置（SPA导航用）
        const compileResult = this.compiler.compile(ast);
        routerConfig = compileResult.routerConfig || '';

        // 缓存结果
        await this.cache.setPage(dslId, pageId, pageHtml, this.cacheTtl);
        await this.cache.setRouterConfig(dslId, routerConfig, this.cacheTtl);
      }

      // 4. 获取懒加载组件列表
      const dsl = await this.storage.get(dslId);
      if (!dsl) {
        return res.status(404).json({ error: 'DSL not found' });
      }
      const lazyComponents = this.getLazyComponentUrls(dsl, pageId);

      // 5. 返回混合架构响应
      res.json({
        html: pageHtml,                    // SSR首屏HTML
        routerConfig,                      // 完整路由配置（客户端SPA用）
        lazyComponents,                    // 其他页面的懒加载URL
        initialData: {                     // 首屏数据
          currentPath: path,
          dslId,
          pageId
        },
        meta: {
          cacheHit: !!pageHtml,
          timestamp: Date.now()
        }
      });

    } catch (error: any) {
      console.error('Render error:', error);
      res.status(500).json({ 
        error: 'Render failed', 
        message: error.message 
      });
    }
  }

  /**
   * 保存DSL
   */
  private async saveDsl(req: Request, res: Response) {
    try {
      const { id, dsl } = req.body;

      // 验证DSL格式
      const ast = this.parser.parse(JSON.stringify(dsl));
      
      // 保存到存储
      await this.storage.save(id, dsl);
      
      // 使缓存失效
      await this.cache.invalidateDsl(id);

      res.json({ 
        success: true, 
        id,
        message: 'DSL saved successfully' 
      });

    } catch (error: any) {
      res.status(400).json({ 
        error: 'Save failed', 
        message: error.message 
      });
    }
  }

  /**
   * 获取DSL
   */
  private async getDsl(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const dsl = await this.storage.get(id);

      if (!dsl) {
        return res.status(404).json({ error: 'DSL not found' });
      }

      const version = await this.storage.getVersion(id);
      
      res.json({ 
        dsl, 
        version,
        id 
      });

    } catch (error: any) {
      res.status(500).json({ 
        error: 'Get failed', 
        message: error.message 
      });
    }
  }

  /**
   * 更新单个页面（增量更新）
   */
  private async updatePage(req: Request, res: Response) {
    try {
      const { id, pageId } = req.params;
      const { data } = req.body;

      const success = await this.storage.updatePage(id, pageId, data);
      
      if (!success) {
        return res.status(404).json({ error: 'DSL or page not found' });
      }

      // 只使该页面缓存失效
      await this.cache.invalidatePage(id, pageId);

      res.json({ 
        success: true, 
        message: 'Page updated successfully',
        pageId 
      });

    } catch (error: any) {
      res.status(500).json({ 
        error: 'Update failed', 
        message: error.message 
      });
    }
  }

  /**
   * 删除DSL
   */
  private async deleteDsl(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const success = await this.storage.delete(id);

      if (!success) {
        return res.status(404).json({ error: 'DSL not found' });
      }

      await this.cache.invalidateDsl(id);

      res.json({ 
        success: true, 
        message: 'DSL deleted successfully' 
      });

    } catch (error: any) {
      res.status(500).json({ 
        error: 'Delete failed', 
        message: error.message 
      });
    }
  }

  /**
   * 列出所有DSL
   */
  private async listDsl(req: Request, res: Response) {
    try {
      const list = await this.storage.list();
      res.json({ list });
    } catch (error: any) {
      res.status(500).json({ 
        error: 'List failed', 
        message: error.message 
      });
    }
  }

  /**
   * 使缓存失效
   */
  private async invalidateCache(req: Request, res: Response) {
    try {
      const { dslId } = req.params;
      await this.cache.invalidateDsl(dslId);

      res.json({ 
        success: true, 
        message: 'Cache invalidated successfully' 
      });

    } catch (error: any) {
      res.status(500).json({ 
        error: 'Invalidate failed', 
        message: error.message 
      });
    }
  }

  // 辅助方法
  private handleValidation(req: Request, res: Response, next: NextFunction) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }

  private extractPageIdFromPath(path: string): string {
    // 简单实现：从路径提取页面ID
    // 生产环境需要根据路由配置匹配
    return path.split('/').filter(Boolean)[0] || 'home';
  }

  private getLazyComponentUrls(dsl: any, currentPageId: string): Record<string, string> {
    // 返回其他页面的懒加载URL
    const urls: Record<string, string> = {};
    
    if (dsl?.pages) {
      dsl.pages.forEach((page: any) => {
        if (page.id !== currentPageId) {
          urls[page.id] = `/api/component/${dsl.id}/${page.id}`;
        }
      });
    }
    
    return urls;
  }

  /**
   * 启动服务器
   */
  start(port: number = 3000): void {
    this.app.listen(port, () => {
      console.log(`🚀 API Server running on http://localhost:${port}`);
      console.log(`📊 Health check: http://localhost:${port}/health`);
    });
  }

  /**
   * 关闭服务器
   */
  async close(): Promise<void> {
    await this.cache.close();
  }

  getApp() {
    return this.app;
  }
}
