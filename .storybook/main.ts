import type { StorybookConfig } from '@storybook/vue3-vite';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const r = (...p: string[]) => resolve(__dirname, '..', ...p);

function isStringAliasRecord(value: unknown): value is Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every((item) => typeof item === 'string')
}

const config: StorybookConfig = {
  "stories": [
    "../packages/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [],
  "framework": {
    "name": "@storybook/vue3-vite",
    "options": {}
  },
  "typescript": {
    "check": false,
  },
  "viteFinal": async (config) => {
    config.resolve = config.resolve ?? {};
    // SPARK 包 → 本地 dist（Storybook 不走 pnpm workspace 软链，需手动重定向）
    const existingAliases = isStringAliasRecord(config.resolve.alias) ? config.resolve.alias : {}
    config.resolve.alias = {
      ...existingAliases,
      '@spark-appworks/spark-component': r('packages/spark-component/dist/index.js'),
      '@spark-appworks/spark-data':      r('packages/spark-data/dist/index.js'),
      '@spark-appworks/spark-app':       r('packages/spark-app/dist/index.js'),
      '@spark-appworks/spark-utils':     r('packages/spark-utils/dist/index.js'),
    };
    return config;
  }
};

export default config;
