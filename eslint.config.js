import baseConfig from '../../shared-config/eslint.config.js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
    ...baseConfig,
    {
        // 扩展 TypeScript 文件匹配模式，适配项目结构
        files: ['features/**/*.ts', 'shared/**/*.ts', 'plugins/**/*.ts', 'app/**/*.ts', 'pages/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: './tsconfig.json',
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/ban-ts-comment': 'warn',
            '@typescript-eslint/no-unsafe-function-type': 'warn',
            '@typescript-eslint/no-require-imports': 'off',
        }
    }
]