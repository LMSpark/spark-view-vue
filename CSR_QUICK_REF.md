# CSR 模式快速参考

## 🚀 常用命令

```bash
# 开发模式（带热更新）
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
# 或
npm start

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 修复代码风格
npm run lint:fix
```

## 📁 项目结构（已移除 SSR）

```
form-create-app/
├── src/
│   ├── main.ts              # ✅ 应用入口（CSR）
│   ├── App.vue              # 根组件
│   ├── router/              # 路由配置
│   ├── views/               # 页面组件
│   ├── components/          # 可复用组件
│   │   └── renderers/       # 动态渲染器（支持 SLOT）
│   ├── pages-config/        # 页面配置（JSON）
│   ├── models/              # DataSet 等核心模型
│   ├── utils/               # 工具函数
│   └── types/               # TypeScript 类型定义
├── docs/                    # 项目文档
├── dist/                    # 构建输出（执行 npm run build 后生成）
├── index.html               # HTML 模板
├── vite.config.ts           # Vite 配置
├── package.json             # 项目依赖
└── tsconfig.json            # TypeScript 配置

已备份（不再使用）:
├── server.ts.bak            # ❌ SSR 服务器
├── server-types.d.ts.bak    # ❌ 服务器类型定义
└── src/
    ├── app.ts.bak           # ❌ SSR 工厂函数
    ├── entry-server.ts.bak  # ❌ SSR 入口
    └── entry-client.ts.bak  # ❌ SSR 客户端入口
```

## 🌐 访问地址

- **开发模式**: http://localhost:3000 (如端口被占用会自动使用其他端口)
- **预览模式**: http://localhost:3000

## 📦 部署流程

### 1. 构建
```bash
npm run build
```

### 2. 检查产物
```bash
ls dist/
# 应该看到: index.html, js/, css/, assets/ 等
```

### 3. 部署到静态服务器

**Nginx 配置示例**:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/dist;
    index index.html;

    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Apache 配置示例**:
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

### Vercel 部署
1. 连接 Git 仓库
2. 构建命令: `npm run build`
3. 输出目录: `dist`
4. 自动部署完成！

### Netlify 部署
1. 连接 Git 仓库
2. Build command: `npm run build`
3. Publish directory: `dist`
4. 一键部署！

## 🔧 配置说明

### Vite 配置亮点
- ✅ 智能代码分割（Vue、Router、Element Plus、Syncfusion 等）
- ✅ 资源文件分类存储（js/, css/, images/, fonts/）
- ✅ 哈希命名策略（优化缓存）
- ✅ 自动导入（Vue API、Element Plus 组件）
- ✅ Mock 数据支持（开发环境）

### 路由配置
路由配置文件: `src/pages-config/routes.json`
- 动态加载路由
- 每个路由对应一个页面配置目录

## 💡 关键差异（SSR vs CSR）

| 项目 | SSR 模式（已移除）| CSR 模式（当前）|
|------|----------------|----------------|
| 入口文件 | `src/entry-client.ts` + `src/entry-server.ts` | `src/main.ts` |
| 服务器 | 需要 Node.js + Express | 任意静态服务器 |
| 构建产物 | `dist/client` + `dist/server` | `dist/` |
| 部署难度 | 需要配置 Node.js 环境 | 上传静态文件即可 |
| 开发速度 | 较慢（SSR 中间件） | 快速（Vite HMR）|
| SEO | 友好 | 需额外处理 |

## 📚 核心功能保持不变

✅ **DataSet 架构** - 完整保留  
✅ **动态渲染器** - 支持 Vue 3 + SLOT 递归  
✅ **Element Plus** - 完整集成  
✅ **Syncfusion EJ2** - 完整集成  
✅ **Form Create** - 完整集成  
✅ **页面配置驱动** - JSON 配置系统  
✅ **路由系统** - Vue Router  
✅ **TypeScript** - 完整类型支持  

## 🆘 常见问题

### Q: 为什么移除 SSR？
A: CSR 模式更简单，部署更方便，开发体验更好。如果不需要 SEO 或首屏性能要求不高，CSR 是更好的选择。

### Q: 如何恢复 SSR？
A: 查看 `CSR_MIGRATION.md` 文档中的"如何恢复 SSR"章节。

### Q: 首屏加载慢怎么办？
A: 
1. 已启用代码分割和缓存优化
2. 可以考虑懒加载路由组件
3. 使用 CDN 加载第三方库
4. 启用 HTTP/2 或 HTTP/3

### Q: SEO 怎么处理？
A:
1. 使用 Prerender.io 等服务
2. 使用 Vue SSG 插件
3. 使用 Puppeteer 预渲染
4. 或恢复 SSR 模式

### Q: 端口被占用怎么办？
A: Vite 会自动尝试其他端口（3001、3002...），或手动指定：
```bash
npm run dev -- --port 4000
```

## 📈 性能优化建议

1. **启用 Gzip/Brotli 压缩** (Nginx/CDN)
2. **配置 HTTP 缓存策略** (静态资源长期缓存)
3. **使用 CDN** (加速全球访问)
4. **懒加载路由** (减小首包体积)
5. **Tree Shaking** (已自动启用)

## 🔗 有用的链接

- [Vite 官方文档](https://vitejs.dev/)
- [Vue 3 文档](https://vuejs.org/)
- [Vue Router 文档](https://router.vuejs.org/)
- [Element Plus 文档](https://element-plus.org/)
- [项目架构文档](docs/architecture/README_ARCHITECTURE.md)

---

**简单、快速、高效的 CSR 开发体验！** 🚀
