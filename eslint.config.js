import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vuePlugin from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default [
    // 基础 JavaScript 推荐配置
    js.configs.recommended,
    
    // Vue 推荐配置
    ...vuePlugin.configs['flat/recommended'],
    
    {
        files: ['**/*.{js,ts,vue}'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'module',
            globals: {
                // Node.js 全局变量
                process: 'readonly',
                __dirname: 'readonly',
                console: 'readonly',
                // 浏览器全局变量
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                fetch: 'readonly',
                alert: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
            }
        },
        rules: {
            // 通用规则
            'no-console': 'off',
            'no-debugger': 'warn',
            'no-unused-vars': 'off', // 由 TypeScript 处理
            'no-undef': 'off', // 由 TypeScript 处理
        }
    },
    
    // TypeScript 文件配置（不包括服务器文件）
    {
        files: ['src/**/*.ts'],
        ignores: ['*.config.ts', 'server.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir: import.meta.dirname,
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-unsafe-function-type': 'off',
            '@typescript-eslint/no-require-imports': 'off',
        }
    },
    
    // 服务器和配置文件（宽松规则）
    {
        files: ['*.ts', 'server.ts', '*.config.ts'],
        languageOptions: {
            parser: tsParser,
        },
        plugins: {
            '@typescript-eslint': tsPlugin
        },
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
        }
    },
    
    // Vue 文件配置
    {
        files: ['**/*.vue'],
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                parser: tsParser,
                extraFileExtensions: ['.vue'],
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            'vue': vuePlugin
        },
        rules: {
            // Vue 规则（宽松）
            'vue/multi-word-component-names': 'off',
            'vue/no-v-html': 'off',
            'vue/require-default-prop': 'off',
            'vue/require-explicit-emits': 'off',
            'vue/max-attributes-per-line': 'off',
            'vue/singleline-html-element-content-newline': 'off',
            'vue/html-self-closing': 'off',
            
            // TypeScript 规则（Vue 文件中）
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            '@typescript-eslint/no-explicit-any': 'off',
        }
    },
    
    // 忽略文件
    {
        ignores: [
            '**/node_modules/**',
            '**/dist/**',
            '**/.vite/**',
            '**/coverage/**',
        ]
    }
]
