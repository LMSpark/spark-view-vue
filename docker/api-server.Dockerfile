# 阶段1：构建
FROM node:20-alpine AS builder

# 安装 pnpm
RUN npm install -g pnpm

WORKDIR /app

# 复制依赖文件
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/api-server/package.json ./packages/api-server/
COPY packages/dsl-parser/package.json ./packages/dsl-parser/
COPY packages/dsl-compiler/package.json ./packages/dsl-compiler/
COPY packages/ssr-server/package.json ./packages/ssr-server/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY packages ./packages
COPY tsconfig.json ./

# 构建
RUN pnpm build

# 阶段2：运行
FROM node:20-alpine

# 安装 pnpm
RUN npm install -g pnpm

WORKDIR /app

# 从构建阶段复制构建产物
COPY --from=builder /app/packages/api-server/dist ./packages/api-server/dist
COPY --from=builder /app/packages/dsl-parser/dist ./packages/dsl-parser/dist
COPY --from=builder /app/packages/dsl-compiler/dist ./packages/dsl-compiler/dist
COPY --from=builder /app/packages/ssr-server/dist ./packages/ssr-server/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api-server/node_modules ./packages/api-server/node_modules
COPY --from=builder /app/packages/api-server/package.json ./packages/api-server/

# 环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动服务
CMD ["node", "packages/api-server/dist/server.js"]
