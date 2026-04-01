# AI Design Session DataSet-In-Memory Plan

> Status: corrected
> Updated: 2026-04-01
> Scope: AiDesignStudio / spark-ai design-session / session-state redesign

---

## 1. Corrected Direction

The previous idea was still too file-oriented.

The correct direction is:

1. put the DataSet into session memory first;
2. make that in-memory DataSet the single source of truth for the design session;
3. treat pagedata.json or other files only as optional exports or runtime projections.

So the center of the redesign is not “generate pagedata.json later”, but “maintain a working DataSet in memory now”.

Old prompts may still be read as reference material, but they must not define the active session contract.

---

## 2. What “DataSet in Memory” Means

Here “memory” has two layers:

### 2.1 Working Memory

While the user is discussing and accepting proposals, the frontend session holds a live working DataSet model.

This working DataSet is the object that Pass A and Pass B read from.

It should exist conceptually inside the design session state, not as an after-the-fact file payload.

### 2.2 Persisted Memory Snapshot

When the session is serialized to `design-session.json`, what gets stored is the snapshot of that working DataSet memory.

This means persistence is still allowed, but persistence is a snapshot of memory, not the primary modeling surface.

---

## 3. New Source of Truth

The source of truth becomes:

1. `workingDataSet` in session memory
2. `viewRegistry` derived from the working DataSet plus accepted view decisions
3. `uiRegistry` derived from accepted UI and interaction decisions

The old `dataRegistry` is no longer the ideal root abstraction.

At most, it becomes:

- a derived index over the working DataSet, or
- a temporary compatibility view during migration

It should not remain the conceptual center of the system.

---

## 4. Target Session Model

The design session should evolve toward a model like this:

```ts
interface WorkingDataSetMemory {
  schemaVersion: 2
  dataSetName: string
  tables: Record<string, WorkingTable>
  tableRelations: WorkingRelation[]
}

interface PersistedDesignSessionV2 {
  version: 2
  currentPass: 'A' | 'B'
  currentStep: DesignStep
  workingDataSet: WorkingDataSetMemory
  viewRegistry: ViewRegistry
  uiRegistry: UIRegistry
  acceptedProposals: AcceptedProposalSnapshot[]
  dependencyGraph: Record<string, string[]>
}
```

The exact type names can change, but the core rule must not:

- session state owns a working DataSet memory object
- proposal application mutates that DataSet memory
- downstream planning reads from that DataSet memory

---

## 5. Proposal Semantics After Correction

### 5.1 `data-model`

`data-model` proposals no longer mean “pagedata fragment”.

They mean: patch or extend the working DataSet memory.

Typical accepted content should describe canonical v2 DataSet structure:

```json
{
  "dataSetName": "OrderDS",
  "tables": {
    "Orders": {
      "columns": [
        { "name": "id", "type": "string", "isPrimaryKey": true },
        { "name": "amount", "type": "number" }
      ],
      "views": {
        "default": {
          "autoCurrentFirst": true,
          "aggregates": {
            "amount": { "type": "sum" }
          }
        }
      }
    }
  },
  "tableRelations": []
}
```

### 5.2 `view-plan`

`view-plan` is not inventing data independently.

It is planning how existing working DataSet memory will be consumed through views.

### 5.3 `ui-structure` and `interaction`

These phases should bind directly to the working DataSet memory and the view plan, not to guessed pagedata file fragments.

---

## 6. Consequences for Current Code

### 6.1 `useDesignSession.ts`

Current state:

- only tracks pageId, phase, userGoal, and proposals

Needed direction:

- add a working DataSet memory holder to the composable or a dedicated session store

### 6.2 `session-state.ts`

Current state:

- `PersistedDesignSession` centers on `dataRegistry`

Needed direction:

- promote `workingDataSet` to first-class session state
- demote `dataRegistry` to derived or transitional structure

### 6.3 `applyProposalToSession()`

Current state:

- parses proposal payload and writes lightweight registry entries

Needed direction:

- apply `data-model` proposals directly into working DataSet memory
- re-derive registry/index structures from the updated DataSet memory

### 6.4 `buildGenerationPrompt()` and generation flow

Current state:

- still tends to aggregate accepted proposals into a file-oriented generation request

Needed direction:

- generation should consume session memory, especially the working DataSet, as structured input
- file export should be a later, optional step

---

## 7. Phased Implementation

### Phase 1: Establish DataSet Memory as the Core Model

Goal:

- stop treating registry fragments as the true data model.

Actions:

1. rewrite the active design-session contract around “working DataSet in memory”
2. update prompt/build language so `data-model` means DataSet memory mutation
3. stop using pagedata-oriented wording as the active design target

Primary files:

- `packages/spark-ai/src/design-prompt.ts`
- `packages/spark-ai/src/design-session.ts`
- `src/composables/useDesignSession.ts`

Exit criteria:

- active session language talks about DataSet memory first, not pagedata first

### Phase 2: Add Working DataSet to Session State

Goal:

- introduce a first-class `workingDataSet` field into session state

Actions:

1. extend `PersistedDesignSession`
2. add migration path from current registry-centric shape
3. make `serializeSession` / `deserializeSession` persist the DataSet snapshot

Primary files:

- `packages/spark-ai/src/session-state.ts`
- related tests

Exit criteria:

- session can round-trip a working DataSet snapshot

### Phase 3: Rewrite Proposal Application Around DataSet Memory

Goal:

- accepted proposals mutate session memory directly

Actions:

1. `applyProposalToSession()` writes into `workingDataSet`
2. derive `dataRegistry`-like indexes from `workingDataSet`
3. reject legacy payloads that bypass the new model

Primary files:

- `packages/spark-ai/src/session-state.ts`
- `packages/spark-ai/src/response-pipeline.ts`

Exit criteria:

- no accepted `data-model` proposal is applied only as loose registry fragments

### Phase 4: Rewire Generation to Consume Memory

Goal:

- generation starts from session memory, not from reinterpreting scattered accepted proposals

Actions:

1. make generation read `workingDataSet`, `viewRegistry`, and `uiRegistry`
2. use those memory objects as the primary structured context
3. only export files after memory state is complete

Primary files:

- `packages/spark-ai/src/design-session.ts`
- `src/components/AiDesignStudio.vue`

Exit criteria:

- generation uses memory-first structured input

### Phase 5: Optional Export Layer

Goal:

- support runtime artifacts without making them the design center

Actions:

1. export working DataSet memory to pagedata.json if needed
2. keep export deterministic
3. make export an output adapter, not the source of truth

Exit criteria:

- pagedata.json becomes an adapter output rather than the modeling surface

---

## 8. Scope Rules

1. do not start from `AiPageService`
2. do not start from legacy prompt docs
3. do start from session memory structure in `packages/spark-ai` and `src/composables`
4. do treat file generation as a later adapter layer

---

## 9. Risks

### Risk 1: Registry Stays the Real Source of Truth

If `dataRegistry` remains primary and `workingDataSet` is only decorative, the redesign will fail.

Mitigation:

- define `workingDataSet` as the first-class field in session state before deep feature work.

### Risk 2: Memory/File Duality Gets Mixed Again

If file export language re-enters the active prompt contract, the system drifts back to pagedata-first.

Mitigation:

- keep file export isolated to the export stage.

### Risk 3: Migration Complexity

Current code, tests, and prompt logic assume registry-first semantics.

Mitigation:

- keep a transitional derived `dataRegistry` view while migrating callers one by one.

---

## 10. Deliverables Checklist

- [x] corrected architectural direction recorded
- [x] DataSet-in-memory phased plan documented
- [ ] rewrite active session contract
- [ ] introduce `workingDataSet` into session state
- [ ] rewrite proposal application around memory
- [ ] rewire generation to consume memory
- [ ] add optional export adapter

---

## 11. Current Recommendation

The next step is not a materializer.

The next step is:

1. define `workingDataSet` in the design session model
2. rewrite the active session contract so `data-model` mutates memory
3. keep pagedata.json out of the center of the redesign