/// <reference types="vite/client" />

declare module 'virtual:spark-components' {
  type RegisterFn = (app: import('vue').App) => { total: number; sync: number; async: number }
  export const registerComponents: RegisterFn
}