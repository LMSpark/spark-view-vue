# Form Create SSR Application - AI Coding Agent Instructions

> 注意：本文件中的路径引用使用代码格式，以便 AI 助手准确理解项目结构。

## Project Overview
This is a **configuration-driven Vue 3 SSR application** with zero-component-per-page architecture. All pages are rendered through a single `DynamicPage.vue` component using JSON configurations.

## Core Architecture Principles

### 1. Single Component Architecture
- **Only one view component**: `src/views/DynamicPage.vue`
- All routes map to this component via `meta.pageId`
- Pages differentiated by loading different JSON configs from `src/mock/pages/{pageId}/`

### 2. Page Configuration Structure
Each page requires exactly these files in `src/mock/pages/{pageId}/`:
- **`rule.json`** (required): UI structure with Element Plus components, event handlers, data bindings
- **`data.json`** (required): Page-specific data accessible via `dataKey` in rules
- **`script.js`** (optional): ES6 module in `src/pageScripts/{pageId}/script.js` exporting event handlers
- **`style.css`** (optional): Scoped CSS auto-prefixed with `[data-page="{pageId}"]`

### 3. Rule.json Schema
```json
{
  "type": "el-button|div|span|el-*",
  "class": "css-class",
  "style": {},
  "props": {},
  "on": { "click": "functionName" },
  "children": ["text" or nested rules],
  "dataKey": "path.to.data",
  "field": "formFieldName",
  "options": []
}
```

### 4. Event Handler Pattern
- Event handlers in `rule.json` reference function names as strings: `"on": { "click": "handleSubmit" }`
- Functions must be exported from `src/pageScripts/{pageId}/script.js`:
  ```javascript
  export function handleSubmit() { /* logic */ }
  ```
- Access runtime context via imports from `../common.js`:
  - `$api()` - form-create API instance
  - `$data()` - page data from data.json
  - `$route()` - current Vue route
  - `$el()` - page container element
  - `$query(selector)` / `$queryAll(selector)` - DOM query within page

### 5. SSR Architecture
- **Server**: `server.ts` - Express + Vite SSR middleware
- **Entry points**: 
  - Client: `src/entry-client.ts` - hydration
  - Server: `src/entry-server.ts` - render to string
- **App factory**: `src/app.ts` - creates SSR app with plugins
- **Routes**: Loaded from `src/mock/routes.json` at runtime

## Critical Workflows

### Adding a New Page
1. Add route to `src/mock/routes.json`:
   ```json
   { "path": "/newpage", "name": "newpage", "pageId": "newpage", "meta": { "title": "New Page" } }
   ```
2. Create `src/mock/pages/newpage/rule.json` and `data.json`
3. (Optional) Create `src/pageScripts/newpage/script.js` with exported functions
4. No Vue component creation needed - uses existing DynamicPage

### Development Commands
- **SSR dev**: `npm run dev:ssr` (port 3000, full SSR with HMR)
- **CSR dev**: `npm run dev` (port 5173, client-only for faster iteration)
- **Build**: `npm run build:ssr` (creates dist/client + dist/server)
- **Type check**: `npm run typecheck` (strict mode - zero errors required)
- **Lint**: `npm run lint:fix` (ESLint with Vue + TypeScript rules)

### Debugging SSR Issues
- Check terminal output - server errors appear in `dev:ssr` console
- Common issue: Component not SSR-compatible (Element Plus/form-create already configured in vite.config.ts)
- Hydration mismatches: Ensure no client-only code in pageScripts during SSR

## Project-Specific Conventions

### File Naming
- Route configs: lowercase with hyphens (not camelCase)
- PageIds: match route names exactly
- Script files: `script.js` not `index.js` or other names

### Data Binding
- Use `dataKey` in rules to reference nested data: `"dataKey": "stats.totalUsers"`
- Tables require `"dataKey"` pointing to array + `"type": "el-table"` with column children
- DO NOT bind data in script.js - all data flows through rule.json

### CSS Scoping
- Styles in `src/mock/pages/{pageId}/style.css` auto-scoped to `[data-page="{pageId}"]`
- Avoid inline styles in rule.json unless dynamic
- Common styles in `src/style.css`

### Type Safety
- All page configs typed via `src/types/index.ts`
- `PageRule` interface defines rule.json structure
- `RouteConfig` for route definitions

## Integration Points

### Form-Create Integration
- Initialized in `src/app.ts` globally
- Accessed via `$api()` in pageScripts
- Uses Element Plus components (el-input, el-select, etc.)
- Docs: form-create.com/v3/element-ui/

### Element Plus
- Auto-imported globally (no component registration needed)
- Use kebab-case in rule.json: `"type": "el-button"` not `"type": "ElButton"`
- Icons: Import from 'element-plus/icons-vue' if needed

### Mock API
- Mock data in `src/mock/` served by vite-plugin-mock in CSR mode
- SSR directly imports JSON files (see `src/entry-server.ts`)
- API interface: `src/api/index.ts`

## Common Mistakes to Avoid

1. **DON'T** create new Vue components in `src/views/` - extend DynamicPage.vue instead
2. **DON'T** use `window` object in pageScripts without checking `typeof window !== 'undefined'`
3. **DON'T** modify `src/app.ts` for page-specific logic - use pageScripts
4. **DON'T** use `.vue` files for pages - everything is JSON-driven
5. **DON'T** import page data directly in scripts - use `$data()` for reactivity

## Quick References

- Architecture deep-dive: `README_ARCHITECTURE.md`
- SSR documentation: `README_SSR.md`
- Example page configs: `src/mock/pages/home/`
- Type definitions: `src/types/index.ts`
