#!/usr/bin/env node
/**
 * SSR Server CLI
 */

import { createSSRServer } from './server.js';

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const dslDir = process.env.DSL_DIR || './dsls';

const server = createSSRServer({
  port,
  dslDir,
});

server.listen();

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
