// shared/constants/index.ts
// 应用常量定义

/**
 * 应用基本信息
 */
export const APP_INFO = {
  name: 'SPARK View',
  version: '1.0.0',
  description: 'Scalable Plugin Architecture for Reactive Components',
  author: 'SPARK Team'
} as const

/**
 * 环境常量
 */
export const ENVIRONMENT = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test'
} as const

/**
 * 组件类型常量
 */
export const COMPONENT_TYPES = {
  // SPARK 组件
  SPARK_BASE: 'spark-base',
  SPARK_RENDERER: 'spark-renderer',

  // EJ2 组件
  EJ2_GRID: 'ej2-grid',
  EJ2_COLUMN: 'ej2-column',

  // 通用组件
  CONTAINER: 'container',
  LAYOUT: 'layout'
} as const

/**
 * 事件常量
 */
export const EVENTS = {
  // 组件生命周期事件
  COMPONENT_MOUNT: 'component:mount',
  COMPONENT_UNMOUNT: 'component:unmount',
  COMPONENT_UPDATE: 'component:update',
  COMPONENT_ERROR: 'component:error',

  // 能力系统事件
  CAPABILITY_REGISTER: 'capability:register',
  CAPABILITY_CONSUME: 'capability:consume',
  CAPABILITY_UNREGISTER: 'capability:unregister',

  // 配置事件
  CONFIG_CHANGE: 'config:change',
  CONFIG_LOAD: 'config:load',
  CONFIG_ERROR: 'config:error',

  // 错误事件
  ERROR_OCCURRED: 'error:occurred',
  ERROR_HANDLED: 'error:handled'
} as const

/**
 * 错误代码常量
 */
export const ERROR_CODES = {
  // 通用错误
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',

  // 组件错误
  COMPONENT_NOT_FOUND: 'COMPONENT_NOT_FOUND',
  COMPONENT_RENDER_ERROR: 'COMPONENT_RENDER_ERROR',
  COMPONENT_LIFECYCLE_ERROR: 'COMPONENT_LIFECYCLE_ERROR',

  // 能力系统错误
  CAPABILITY_NOT_FOUND: 'CAPABILITY_NOT_FOUND',
  CAPABILITY_CONFLICT: 'CAPABILITY_CONFLICT',
  CAPABILITY_CYCLE: 'CAPABILITY_CYCLE',

  // 配置错误
  CONFIG_INVALID: 'CONFIG_INVALID',
  CONFIG_MISSING: 'CONFIG_MISSING',
  CONFIG_LOAD_ERROR: 'CONFIG_LOAD_ERROR'
} as const

/**
 * HTTP 状态码常量
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503
} as const

/**
 * 超时常量 (毫秒)
 */
export const TIMEOUTS = {
  DEFAULT_API: 30000, // 30秒
  SHORT_API: 5000,    // 5秒
  LONG_API: 60000,    // 1分钟
  COMPONENT_UPDATE: 100, // 100毫秒
  DEBOUNCE_DEFAULT: 300, // 300毫秒
  THROTTLE_DEFAULT: 100  // 100毫秒
} as const

/**
 * 分页常量
 */
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 1
} as const

/**
 * 缓存常量
 */
export const CACHE = {
  DEFAULT_TTL: 300000, // 5分钟
  LONG_TTL: 3600000,   // 1小时
  SHORT_TTL: 60000     // 1分钟
} as const

/**
 * 验证常量
 */
export const VALIDATION = {
  MAX_STRING_LENGTH: 10000,
  MIN_STRING_LENGTH: 1,
  MAX_ARRAY_LENGTH: 1000,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  URL_REGEX: /^https?:\/\/.+/,
  UUID_REGEX: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
} as const

/**
 * 主题常量
 */
export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  AUTO: 'auto'
} as const

/**
 * 语言常量
 */
export const LANGUAGES = {
  EN: 'en',
  ZH_CN: 'zh-cn',
  ZH_TW: 'zh-tw'
} as const

/**
 * 存储键常量
 */
export const STORAGE_KEYS = {
  THEME: 'spark:theme',
  LANGUAGE: 'spark:language',
  USER_PREFERENCES: 'spark:user-preferences',
  COMPONENT_CACHE: 'spark:component-cache',
  CONFIG_CACHE: 'spark:config-cache'
} as const

/**
 * 路由常量
 */
export const ROUTES = {
  HOME: '/',
  DEMO: '/demo',
  EJ2_DEMO: '/ej2-demo',
  SPARK_DEMO: '/spark-demo',
  DOCS: '/docs'
} as const

/**
 * API 端点常量
 */
export const API_ENDPOINTS = {
  BASE: '/api',
  COMPONENTS: '/api/components',
  CONFIG: '/api/config',
  HEALTH: '/api/health'
} as const

/**
 * 文件扩展名常量
 */
export const FILE_EXTENSIONS = {
  VUE: '.vue',
  TS: '.ts',
  JS: '.js',
  JSON: '.json',
  MD: '.md'
} as const

/**
 * 正则表达式常量
 */
export const REGEX = {
  COMPONENT_NAME: /^[a-z][a-z0-9-]*$/,
  CAPABILITY_NAME: /^[a-zA-Z][a-zA-Z0-9_]*$/,
  EMAIL: VALIDATION.EMAIL_REGEX,
  URL: VALIDATION.URL_REGEX,
  UUID: VALIDATION.UUID_REGEX
} as const

/**
 * 性能常量
 */
export const PERFORMANCE = {
  MAX_COMPONENT_DEPTH: 10,
  MAX_CHILDREN_COUNT: 100,
  RENDER_TIMEOUT: 5000, // 5秒
  UPDATE_DEBOUNCE: 16    // ~60fps
} as const

/**
 * 调试常量
 */
export const DEBUG = {
  ENABLED: process.env.NODE_ENV === ENVIRONMENT.DEVELOPMENT,
  LOG_LEVEL: process.env.NODE_ENV === ENVIRONMENT.DEVELOPMENT ? 'debug' : 'warn',
  PERFORMANCE_MONITORING: process.env.NODE_ENV === ENVIRONMENT.DEVELOPMENT
} as const