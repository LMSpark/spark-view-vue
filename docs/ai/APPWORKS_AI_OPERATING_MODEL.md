# AppWorks AI Operating Model

## Positioning

AppWorks treats navigation, data model, and the page four-file protocol as the source of truth. AI should help plan business software and produce configuration artifacts, not bypass the platform by generating ad-hoc application code.

Default page output is limited to:

- `rule.json`
- `pagedata.json`
- `script.js`
- `style.css`

Platform source code changes require explicit human authorization and a separate implementation plan.

## Model Routing

Use model routing instead of a single fixed model. The same Claude Code shell can point to different Anthropic-compatible endpoints through environment variables.

| Task | Preferred model route |
| --- | --- |
| Business software planning, module boundaries, workflow and permission design | GLM or high-end Qwen through a coding plan |
| Daily page configuration generation | Kimi K2.5 or Qwen 3.6 Plus |
| JSON schema, `rule.json`, `pagedata.json` consistency | Kimi K2.5 or Qwen 3.6 Plus |
| Small `script.js` logic and config-time helpers | Qwen Coder |
| Screenshot, UI, design image, and visual defect analysis | Kimi K2.5 or Qwen multimodal models |
| Low-cost text-only fallback | DeepSeek V4 Pro |

## Recommended Runtime Profiles

### Current Fallback

DeepSeek is already configured as the current text-only fallback:

```text
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_MODEL=deepseek-v4-pro
```

It is useful for pure text planning and coding tasks, but it should not be the long-term default for UI-heavy AppWorks workflows because it does not cover multimodal input.

### Single-Model Trial

Kimi K2.5 is the lowest-friction single-model trial when Claude Code compatibility matters:

```text
ANTHROPIC_BASE_URL=https://api.moonshot.ai/anthropic
ANTHROPIC_MODEL=kimi-k2.5
```

### Long-Term Operations

Use an Anthropic-compatible model plan or gateway so AppWorks can route by task type without changing the product workflow. Keep one command-line profile for coding-plan work and another for low-cost fallback.

The local helper script is:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\claude-model.ps1 -Action show
```

For China-region Alibaba Cloud Model Studio profiles, the helper uses:

```text
Pay-as-you-go Anthropic-compatible endpoint:
https://dashscope.aliyuncs.com/apps/anthropic

Coding Plan endpoint:
https://coding.dashscope.aliyuncs.com/apps/anthropic
```

## Operating Workflow

1. Convert business request into modules, pages, data models, navigation, permissions, and acceptance criteria.
2. Produce or update only the page four-file artifacts for normal page work.
3. Validate generated JSON against platform expectations before running the page.
4. Use screenshots and rendered UI feedback for multimodal correction loops.
5. Escalate to platform source changes only when the configuration protocol cannot express the required behavior.

## Guardrails

- Do not generate standalone business application code when a page can be expressed by the four-file protocol.
- Do not create hidden data side channels outside `pagedata.json` and the DataSet pipeline.
- Do not treat `script.js` as the primary implementation surface; use it only for behavior that configuration cannot express.
- Do not change platform source code during normal page generation.
- Keep model keys out of the repository. Use user environment variables or local secret files that are already ignored.
