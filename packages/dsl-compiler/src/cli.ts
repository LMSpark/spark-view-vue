#!/usr/bin/env node

/**
 * SPARK VIEW 静态构建 CLI
 * 将 DSL 编译成完全独立的静态站点
 */

import { Command } from 'commander';
import { StaticBuilder } from './static-builder';
import * as path from 'path';

const program = new Command();

program
  .name('spark-build')
  .description('将 DSL 编译成静态站点，前端运行时不再依赖 DSL')
  .version('1.0.0');

program
  .command('build')
  .description('构建静态站点')
  .requiredOption('-i, --input <path>', 'DSL 文件路径')
  .option('-o, --output <dir>', '输出目录', 'dist')
  .option('-b, --base-url <url>', '基础 URL', '')
  .option('-p, --public-path <path>', '资源路径', '/')
  .option('--minify', '压缩输出', false)
  .action(async (options) => {
    console.log('🚀 SPARK VIEW 静态构建开始...\n');
    console.log('📄 输入文件:', options.input);
    console.log('📁 输出目录:', options.output);
    console.log('');

    const builder = new StaticBuilder();
    
    const result = await builder.build({
      dslPath: path.resolve(options.input),
      outputDir: path.resolve(options.output),
      baseUrl: options.baseUrl,
      publicPath: options.publicPath,
      minify: options.minify
    });

    if (result.success) {
      console.log('✅ 构建成功！\n');
      console.log(`📊 统计信息:`);
      console.log(`  - 生成页面: ${result.pages.length} 个`);
      console.log(`  - 生成资源: ${result.assets.length} 个`);
      console.log(`  - 构建耗时: ${result.duration}ms`);
      console.log('');
      console.log('📦 生成的文件:');
      [...result.pages, ...result.assets].forEach(file => {
        console.log(`  - ${path.relative(process.cwd(), file)}`);
      });
      console.log('');
      console.log('🎉 静态站点已生成，可直接部署！');
      console.log('💡 提示: 前端运行时不再需要 DSL 或 API Server');
    } else {
      console.error('❌ 构建失败');
      process.exit(1);
    }
  });

program
  .command('serve')
  .description('预览构建后的静态站点')
  .option('-d, --dir <dir>', '静态文件目录', 'dist')
  .option('-p, --port <port>', '端口号', '8080')
  .action(async (options) => {
    const express = require('express');
    const app = express();
    
    app.use(express.static(path.resolve(options.dir)));
    
    app.listen(options.port, () => {
      console.log(`🌐 静态服务器已启动:`);
      console.log(`   http://localhost:${options.port}`);
      console.log('');
      console.log('💡 这是纯静态站点，不依赖任何后端服务');
    });
  });

program.parse();
