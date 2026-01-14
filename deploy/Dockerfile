# Docker多级缓存构建
FROM node:18-alpine as builder

# 构建阶段
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build:spa

# 生产阶段 - Nginx
FROM nginx:alpine

# 复制构建结果
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制Nginx配置
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# 启用Gzip模块
RUN echo "gzip on;" >> /etc/nginx/conf.d/gzip.conf && \
    echo "gzip_vary on;" >> /etc/nginx/conf.d/gzip.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]