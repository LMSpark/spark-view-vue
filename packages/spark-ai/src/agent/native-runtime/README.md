# native-runtime

VCM metadata → 可执行脚本 API 的运行时层。

## 职责

- `native-script-context.ts`：`createAiApiScriptContext`、`executeAiApiAction`；Proxy 链式 API、参数归一化、schema 校验、反射调用。
- `native-script-runner.ts`：`createAiNativeScriptContext`、`executeAiNativeScript`；metadata 解析 + 沙箱入口。

## 消费方

| API | 调用方 |
|-----|--------|
| `createAiApiScriptContext` | `VcmNativeAgentAdapter`（`vcm_script` 的 `this`）、单测 |
| `executeAiNativeScript` | metadata-first 直跑、单测 |
| `executeModuleScript` | 已移除；`vcm_script` 直接走 `native-script-sandbox.ts` |

## 文档

[`docs/native-runtime-and-agent-flow-zh-cn.md`](../../../docs/native-runtime-and-agent-flow-zh-cn.md)
