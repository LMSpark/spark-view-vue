# Merge requirement document import into projectPlanning

## Confirmed decisions

- Remove the old `requirementImport` business alias and UI wording; merge the Word document path into `projectPlanning`.
- UI name becomes `projectPlanningDocumentImport` / "导入项目策划文档".
- Frontend Word parsing is not reliable enough; do not keep Mammoth browser parsing as the production path.
- Backend stores the original Word file and attachment metadata.
- `planningAttachmentRef` is an opaque backend attachment id.
- Do not persist parsed text as a second truth source.
- Do not return full parsed Word text to the frontend.
- First scope only supports project-level planning attachment, written to `ProjectInfo.planningAttachmentRef`.
- Node-level attachment import is out of this round.
- Frontend should show AI run status through existing trace/tool-call projection, not by owning the document text.

## Target architecture

### Data path

1. Frontend uploads a `.docx` file to a project-scoped planning attachment endpoint.
2. Backend stores the original file plus metadata.
3. Backend returns only attachment metadata:
   - `planningAttachmentRef`
   - original filename
   - size
   - MIME/content type
   - created/updated timestamp
4. Frontend writes `planningAttachmentRef` to project info.
5. `projectPlanning` runs with `planningAttachmentRef`, not `planningAttachmentText`.
6. Before each `projectPlanning` LLM turn, the backend resolves `planningAttachmentRef`, extracts bounded Word text, and appends it to the system prompt as `[projectPlanningAttachmentText]`.

### Status path

1. Frontend continues to run through the existing AI runner/adapter path.
2. `createAiRunAdapter().subscribe()` supplies live trace snapshot, AG-UI events and tool calls.
3. DevSystem renders a compact status/timeline for:
   - upload saved
   - backend attachment prompt injection completed/failed
   - LLM started
   - model query/script calls
   - agent complete
   - navigation save result

## Implementation outline

### Backend

- Add planning attachment configuration, storage service and controller.
- Add a project-scoped API under:
  - `POST /api/tenants/{tenantId}/projects/{projectId}/planning-attachments`
  - `GET /api/tenants/{tenantId}/projects/{projectId}/planning-attachments/{attachmentId}/text` for backend/debug verification
- Use Apache Tika for `.docx` text extraction at read time.
- Store metadata in DB and original file in server storage.
- Add project `planning_attachment_ref` persistence so `ProjectInfo.planningAttachmentRef` survives reload.

### Frontend app

- Replace `RequirementImportDialog` usage with `ProjectPlanningDocumentImportDialog`.
- Upload via `FormData`, receive `planningAttachmentRef`, and patch project info.
- Run `projectPlanning` with `planningAttachmentRef`.
- Remove browser `parseDocxToText` from the production flow.
- Remove `requirementImport` host-run registration from `App.vue`.

### AI/session chain

- Extend `projectPlanning` input normalization to accept `planningAttachmentRef`.
- Inject bounded attachment text in the backend `projectPlanning` LLM turn when `planningAttachmentRef` is present.
- Prompt instructions should make LLM prefer `[projectPlanningAttachmentText]` over the short fallback requirement.
- Keep parsed text out of frontend state and out of persistent project model.

### UI observability

- Reuse existing AI run adapter trace instead of inventing a new event bus.
- Add a compact progress/timeline panel to the import/project planning dialog.
- Render tool calls at the level of tool name/status/result summary.
- Do not expose raw full document text by default.

## Verification

- Backend tests:
  - upload stores metadata and original file
  - text endpoint extracts content from `.docx`
  - project update/read includes `planningAttachmentRef`
- Frontend/unit tests:
  - upload success writes `planningAttachmentRef`
  - `projectPlanning` runner passes ref without text
  - old `requirementImport` imports are gone
- Targeted commands:
  - `pnpm exec vitest run tests/services/project-planning-ai-runner.test.ts tests/services/project-planning-host-run-provider.test.ts`
  - backend Maven test for new attachment service/controller
  - scoped typecheck after TS changes

## Open risks

- Adding Apache Tika changes Maven dependencies and server startup footprint.
- Exact DB migration must be idempotent for existing local databases.
- Backend prompt injection needs size/chunk limits to avoid huge prompts.
