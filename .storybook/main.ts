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
    "checkOptions": {},
    "reactDocgen": "react-docgen-typescript",
    "reactDocgenTypescriptOptions": {
      "shouldExtractLiteralValuesFromEnum": true,
      "propFilter": (prop) => (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true),
    },
  },
  "viteFinal": async (config) => {
    // 自定义Vite配置以支持SPARK工作空间
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string>),
      '@spark-view/spark-component': new URL('../packages/spark-component/src', import.meta.url).pathname,
      '@spark-view/spark-data': new URL('../packages/spark-data/src', import.meta.url).pathname,
      '@spark-view/spark-app': new URL('../packages/spark-app/src', import.meta.url).pathname,
      '@spark-view/spark-utils': new URL('../packages/spark-utils/src', import.meta.url).pathname,
    };
    return config;
  }
};

export default config;