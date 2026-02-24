import type { StorybookConfig } from '@storybook/vue3-vite';

const config: StorybookConfig = {
  "stories": [
    "../packages/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@storybook/addon-essentials",
    "@storybook/addon-interactions"
  ],
  "framework": {
    "name": "@storybook/vue3-vite",
    "options": {}
  },
  "typescript": {
    "check": false,
  },
  "viteFinal": async (config) => {
    // 自定义Vite配置以支持SPARK工作空间
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string>),
      // 安装方式：通过 dist 解析，不直接引用包项目 src/
      '@spark-view/spark-component': new URL('../packages/spark-component/dist/index.js', import.meta.url).pathname,
      '@spark-view/spark-data': new URL('../packages/spark-data/dist/index.js', import.meta.url).pathname,
      '@spark-view/spark-app': new URL('../packages/spark-app/dist/index.js', import.meta.url).pathname,
      '@spark-view/spark-utils': new URL('../packages/spark-utils/dist/index.js', import.meta.url).pathname,
    };
    return config;
  }
};

export default config;