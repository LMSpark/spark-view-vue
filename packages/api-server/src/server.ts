import { ApiServer } from './index';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const port = parseInt(process.env.PORT || '3000', 10);
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const cacheTtl = parseInt(process.env.CACHE_TTL || '3600', 10);

const server = new ApiServer({
  port,
  redisUrl,
  cacheTtl
});

server.start(port);

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  await server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing server...');
  await server.close();
  process.exit(0);
});
