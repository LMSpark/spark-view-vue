# 运行时架构 vs 编译时架构

## 核心差异

### ❌ 当前问题：运行时耦合

**前端仍然依赖 DSL**：
```
用户访问 → Nginx → API Server → 读取 DSL → 编译 → 返回
                                  ↑
                              仍需 DSL 文件
```

**问题**：
1. 前端运行依赖后端服务
2. 需要 API Server 实时编译
3. DSL 文件必须在线可用
4. 部署复杂（需要完整后端栈）

### ✅ 理想架构：编译时解耦

**类似原 C# Razor 架构**：
```
构建时：
DSL → 静态构建器 → 生成独立文件
                    ↓
                  dist/
                    ├── index.html
                    ├── about.html
                    ├── app.js      (所有组件已编译)
                    ├── router.js   (路由配置)
                    └── app.css

运行时：
用户访问 → CDN/Nginx → 返回静态文件
                      （不需要 DSL）
```

**优势**：
1. ✅ 前端完全独立，不依赖后端
2. ✅ 部署简单（纯静态文件）
3. ✅ 性能极佳（CDN + HTTP/2）
4. ✅ 成本低（无需服务器计算）

## 两种架构对比

| 维度 | 运行时架构 (当前) | 编译时架构 (新增) |
|-----|------------------|------------------|
| **DSL 依赖** | 运行时需要 | 构建时需要，运行时不需要 |
| **前端独立性** | ❌ 依赖 API Server | ✅ 完全独立 |
| **首屏性能** | SSR ~50ms | 静态文件 ~5ms |
| **部署复杂度** | 高（Node + Redis + Nginx） | 低（纯静态托管） |
| **扩展性** | 需要服务器集群 | CDN 自动扩展 |
| **成本** | 服务器 + 带宽 | 仅 CDN 流量 |
| **适用场景** | 频繁更新、动态内容 | 内容相对固定 |
| **SEO** | ✅ 服务端渲染 | ✅ 预渲染 HTML |
| **更新方式** | 热更新 DSL | 重新构建 + 部署 |

## 使用方法

### 方案 A: 运行时架构（当前实现）

**适用场景**：
- 内容频繁变化
- 需要个性化内容
- A/B 测试
- 用户权限控制

**部署架构**：
```bash
# 启动 Redis
docker run -d redis

# 启动 API Server
pnpm dev:api

# 前端访问 API
fetch('/api/render?dslId=xxx&path=/about')
```

### 方案 B: 编译时架构（新实现）

**适用场景**：
- 内容相对稳定
- 官网、文档站
- 博客、营销页面
- 追求极致性能

**构建流程**：
```bash
# 1. 准备 DSL 文件
cat > my-site.json << EOF
{
  "dslVersion": "1.0.0",
  "name": "我的站点",
  "pages": [...],
  "routes": [...]
}
EOF

# 2. 静态构建
pnpm build:static -i my-site.json -o dist

# 3. 部署到任何静态托管
#    - Vercel
#    - Netlify  
#    - GitHub Pages
#    - 阿里云 OSS
#    - 腾讯云 COS
```

**生成的文件结构**：
```
dist/
├── index.html       # 首页（SSR 预渲染）
├── about.html       # 关于页（SSR 预渲染）
├── contact.html     # 联系页（SSR 预渲染）
├── app.js          # 完整应用（所有组件已编译）
├── router.js       # 路由配置（从 DSL 生成）
└── app.css         # 样式文件
```

**部署示例（Nginx）**：
```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/dist;
    index index.html;

    # SPA 回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## 性能对比

### 首屏加载时间

**运行时架构**：
```
请求 → API Server (50ms) → Redis (3ms) → 返回 HTML
总计: ~53ms
```

**编译时架构**：
```
请求 → CDN/Nginx → 返回静态 HTML
总计: ~5ms (快 10 倍)
```

### 后续导航

两者相同，都是 SPA 客户端路由：
```
点击链接 → Vue Router → 切换组件 (~10ms)
```

### 资源加载

**运行时架构**：
```
index.html (SSR)           5 KB
+ Vue CDN                  100 KB
+ app.js (动态加载组件)     按需
总计: ~105 KB + 按需加载
```

**编译时架构**：
```
index.html (预渲染)        5 KB
+ Vue CDN                  100 KB
+ app.js (所有组件)        50 KB
+ router.js                5 KB
+ app.css                  10 KB
总计: ~170 KB (一次加载全部)
```

## 混合方案：最佳实践

实际生产中，可以混合使用：

### 官网/营销页 → 编译时架构
```
www.example.com      → 静态构建（极致性能）
  ├── /
  ├── /about
  └── /pricing
```

### 应用/后台 → 运行时架构
```
app.example.com      → 动态渲染（灵活更新）
  ├── /dashboard
  ├── /profile
  └── /settings
```

### 部署架构
```
                ┌─────────────┐
                │   用户请求   │
                └──────┬──────┘
                       │
                 ┌─────▼─────┐
                 │  DNS 解析  │
                 └─────┬─────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
   │官网(CDN)│   │应用(API)│   │文档(CDN)│
   │ 静态化   │   │ 动态化   │   │ 静态化   │
   └─────────┘   └─────────┘   └─────────┘
```

## 对比原 C# Razor 架构

### 相似之处

**都是编译时解耦**：
```
C# Razor:
  DSL → C# 编译 → JS/CSS → 浏览器加载
  
SPARK VIEW (新方案):
  DSL → Node 编译 → HTML/JS/CSS → 浏览器加载
```

### 改进之处

| 维度 | C# Razor | SPARK VIEW 静态构建 |
|-----|----------|-------------------|
| **编译速度** | 中等（C# 编译） | 快（TS/JS 编译） |
| **SSR 预渲染** | ❌ 需要额外工具 | ✅ 内置 SSR |
| **组件系统** | Razor 组件 | Vue 组件（生态更丰富） |
| **开发体验** | Visual Studio | VS Code + HMR |
| **跨平台** | ❌ 依赖 .NET | ✅ Node.js 全平台 |
| **部署** | IIS / Kestrel | 任何静态托管 |

## 选择建议

### 选择运行时架构（API Server）如果：
- ✅ 需要频繁更新内容（每天/每小时）
- ✅ 需要个性化推荐
- ✅ 需要 A/B 测试
- ✅ 需要实时数据
- ✅ 有服务器运维能力

### 选择编译时架构（静态构建）如果：
- ✅ 内容更新不频繁（每周/每月）
- ✅ 追求极致性能
- ✅ 预算有限
- ✅ 不想维护服务器
- ✅ 简化部署流程

### 混合使用如果：
- ✅ 有多个子站点
- ✅ 既要性能又要灵活性
- ✅ 官网 + 应用分离架构

## 迁移路径

从运行时迁移到编译时：

```bash
# 1. 导出 DSL
curl http://localhost:3000/api/dsl/my-app > my-app.json

# 2. 静态构建
pnpm build:static -i my-app.json -o dist

# 3. 本地预览
pnpm serve dist

# 4. 部署到静态托管
vercel deploy dist
# 或
netlify deploy --dir=dist
```

## 总结

**原来的观察是正确的**：理想情况下，**前端应用与 DSL 应该解耦**。

- **运行时架构**：适合动态内容，但前端仍依赖 DSL
- **编译时架构**：前端完全独立，类似原 C# Razor 方案
- **最佳实践**：根据场景混合使用

新增的静态构建器让你可以像原来一样，将 DSL 完全编译成独立的静态文件，前端运行时不再需要 DSL 或任何后端服务。
