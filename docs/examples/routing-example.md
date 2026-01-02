# SPARK VIEW - 路由系统示例

这个示例展示了如何使用 DSL 定义多页面应用的路由配置。

## 完整示例

```yaml
dslVersion: "1.0"

# 路由器配置
router:
  mode: history  # 使用 HTML5 History 模式
  base: /app/
  scrollBehavior: smooth

# 路由定义
routes:
  - path: /
    name: home
    pageId: homePage
    meta:
      title: 首页
      requiresAuth: false
  
  - path: /products
    name: products
    pageId: productsPage
    meta:
      title: 产品列表
      icon: 📦
  
  - path: /products/:id
    name: productDetail
    pageId: productDetailPage
    meta:
      title: 产品详情
      keepAlive: true
  
  - path: /about
    name: about
    pageId: aboutPage
    meta:
      title: 关于我们
      icon: ℹ️

# 导航配置
navigation:
  header:
    type: navbar
    items:
      - label: 首页
        path: /
        icon: 🏠
      
      - label: 产品
        path: /products
        icon: 📦
        children:
          - label: 全部产品
            path: /products
          - label: 特色产品
            path: /products?featured=true
      
      - label: 关于
        path: /about
        icon: ℹ️
  
  breadcrumb:
    enabled: true
    separator: "/"
    home: 首页

# 页面定义
pages:
  - id: homePage
    title: "首页"
    layout:
      type: container
      props:
        maxWidth: "1200px"
        padding: "40px 20px"
      children:
        - type: header
          children:
            - type: text
              props:
                content: "{{ data.welcome }}"
                fontSize: "48px"
                fontWeight: "bold"
        
        - type: section
          children:
            - type: text
              props:
                content: "{{ data.description }}"
                fontSize: "18px"
                color: "#666"
  
  - id: productsPage
    title: "产品列表"
    layout:
      type: container
      children:
        - type: text
          props:
            content: "产品列表"
            fontSize: "32px"
        
        - type: list
          loop:
            items: "data.products"
            itemVar: "product"
          children:
            - type: card
              props:
                title: "{{ product.name }}"
                description: "{{ product.description }}"
                price: "{{ product.price }}"
  
  - id: productDetailPage
    title: "产品详情"
    layout:
      type: container
      children:
        - type: text
          props:
            content: "产品详情页"
            fontSize: "32px"
  
  - id: aboutPage
    title: "关于我们"
    layout:
      type: container
      children:
        - type: text
          props:
            content: "{{ data.company }}"
            fontSize: "32px"
        
        - type: text
          props:
            content: "{{ data.mission }}"

# 数据
data:
  welcome: "欢迎使用 SPARK VIEW"
  description: "基于 DSL 的现代化前端框架"
  company: "SPARK VIEW 团队"
  mission: "让前端开发更简单"
  products:
    - name: "产品 A"
      description: "这是产品 A 的描述"
      price: 99.99
    - name: "产品 B"
      description: "这是产品 B 的描述"
      price: 149.99
```

## 路由特性说明

### 1. 动态路由参数
```yaml
routes:
  - path: /products/:id
    name: productDetail
    pageId: productDetailPage
```

### 2. 嵌套路由
```yaml
routes:
  - path: /dashboard
    name: dashboard
    pageId: dashboardPage
    children:
      - path: stats
        name: dashboardStats
        pageId: statsPage
      - path: users
        name: dashboardUsers
        pageId: usersPage
```

### 3. 路由元信息
```yaml
meta:
  title: 产品详情
  requiresAuth: true
  roles: ['admin', 'editor']
  keepAlive: true
  icon: 📦
```

### 4. 路由守卫
```yaml
routes:
  - path: /admin
    name: admin
    pageId: adminPage
    beforeEnter: "checkAuth()"
    meta:
      requiresAuth: true
```

### 5. 导航组件
```yaml
navigation:
  header:
    type: navbar
    items:
      - label: 首页
        path: /
        icon: 🏠
      - label: 产品
        path: /products
        children:
          - label: 全部产品
            path: /products
          - label: 特色产品
            path: /products/featured
```

## 使用方式

1. **在 DSL 编辑器中使用**：
   - 打开 http://localhost:5173/editor
   - 粘贴上述 DSL 代码
   - 实时预览路由效果

2. **在应用中集成**：
   ```typescript
   import { parse, compile } from '@spark-view/dsl-parser';
   
   const dsl = parse(yamlContent, 'yaml');
   const { ssrBundle, routes, navigation } = compile(dsl);
   ```

3. **路由跳转**：
   - 声明式：`<router-link to="/products">产品</router-link>`
   - 编程式：`router.push({ name: 'products' })`

## 高级特性

### 懒加载
```yaml
routes:
  - path: /admin
    name: admin
    pageId: adminPage
    meta:
      lazy: true  # 启用懒加载
```

### 重定向
```yaml
routes:
  - path: /old-path
    redirect: /new-path
```

### 路由过渡动画
```yaml
router:
  transition: fade  # slide, fade, zoom
  transitionDuration: 300
```

## 最佳实践

1. **统一路由命名**：使用小写字母和连字符
2. **合理使用元信息**：存储页面标题、权限要求等
3. **嵌套路由**：用于复杂的多级导航结构
4. **路由守卫**：实现权限控制和数据预加载
5. **Keep-Alive**：缓存需要保持状态的页面
