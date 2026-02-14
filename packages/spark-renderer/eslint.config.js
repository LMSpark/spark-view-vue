import baseConfig from '../../eslint.config.js'

export default [
  ...baseConfig,
  {
    files: ['src/**/*.{ts,tsx,js,vue}'],
    rules: {
      // 包特定的规则可以在这里添加
    }
  }
]