# AI Code Generation Behavior Spec

> Codex, Copilot, Claude, and other AI coding assistants MUST follow these rules when modifying this repository.

## 0. Governance Priority

AI code generation rules are production-line quality gates, ranked after philosophy and logic, before compatibility. In case of conflict:

`Philosophy > Logic > AI Code Generation Rules > SSOT || SOLID > Delete || Merge || Split > Compatibility`

- Business philosophy and closed-loop production lines take precedence over formal rules. If rules harm philosophy or logic, fix the rules.
- AI code generation rules take precedence over legacy public surfaces and compatibility layers. Flattened exports, old protocols, and old paths kept for compatibility should be narrowed.
- SSOT and SOLID serve business logic — do not use them as mechanical slogans.
- When you find real duplication, wrong boundaries, or outdated compatibility layers: delete what should be deleted, merge what should be merged, split what should be split. Compatibility comes last; only keep migration paths with clear business value.

## 1. Code Organization Hierarchy

Core principle: **Organize code in layers, not as a flat pile of files.** A module's typical layering:

```
Contract layer (few interfaces, cross-module protocols)
  ↓
Entity/Domain layer (classes, state + behavior in one place)
  ↓
Implementation layer (class implements contract)
  ↓
Subclass layer (genuine "is-a" specialization, not method reuse)
```

- No "interface flat-land" — dozens of peer-level interfaces scattered everywhere with no hierarchy, most having a single implementation.
- No "type flat-land" — utility generics and fragmented type exports everywhere.
- No "class flat-land" — a dozen class files flat in one directory, class names with no hierarchy prefix, related classes scattered everywhere.
- No "file flat-land" — twenty or thirty files at the same level in a single directory with no subdirectory grouping.
- No "folder flat-land" — more than 7 sibling directories with no parent grouping, all flat.
- Reuse existing classes, registries, factories, capability keys, and domain objects before introducing new structures.
- A module's public surface should be single-digit. If callers need to import a pile of things, converge through a facade first.

### Interface Usage Principles

Core stance: **An interface is a contract, not decoration.** Sprawling trees of disconnected peer-level interfaces with no hierarchy, no ownership, and no consumers — that's the "interface flat-land" anti-pattern.

#### When Interfaces Are Allowed (SPICE)

- **Stable contract** — cross-module, cross-team, cross-process protocols with high change cost.
- **Polymorphism** — two or more classes/modules sharing the same protocol; swapping implementations without affecting callers.
- **Boundary crossing** — DTOs, configs, payloads, event bodies that cross module boundaries.
- **Consumer exists** — imported by external callers or downstream modules, not "might be useful later."
- If none of the above applies → **no interface.** Use a class, type alias, or inline instead.

#### Prohibitions

- Do NOT create a same-name `interface` for every `class`.
- Do NOT use `Ixxx`, `XxxInterface`, `XxxImpl` mechanical naming.
- Do NOT scatter "one interface per file" fragments — related interfaces belong in a single contract file.
- Do NOT create an interface with only one implementation — that's not a contract, that's bloat.
- Do NOT export public interfaces with no consumers — if nothing imports it, delete it.

#### Anti-Pattern: Interface Flat-Land

```ts
// ❌ PROHIBITED: module exports 6 peer-level interfaces across 4 files, most with single impl

// --- user-types.ts ---
export interface User { id: string; name: string }
export interface UserCreateInput { name: string; email: string }
export interface UserUpdateInput { name?: string; email?: string }

// --- user-repo.ts ---
export interface UserRepository {
  findById(id: string): User
  create(input: UserCreateInput): User
}

// --- user-service.ts ---
export interface UserService {
  getUser(id: string): User
  registerUser(input: UserCreateInput): User
}

// --- user-controller.ts ---
export interface UserController {
  handleGet(req: Request): Response
}

// The entire module ends up with one UserRepositoryImpl, one UserServiceImpl…
// 6 interfaces, all flat, no hierarchy, callers import a pile of fragments.
```

#### Correct Pattern: Layered Organization

```ts
// ✅ CORRECT: converge by contract layer — one module exposes limited contracts

// --- user-contract.ts ---（the single public contract file）
export interface UserRepository {
  findById(id: string): User
  create(input: UserCreateInput): User
}

// Only truly multi-implementation or cross-boundary types go in contract;
// the rest use type aliases or classes internally.

// --- user.entity.ts ---
export class User {
  // state + behavior in one place — no separate IUser needed
  constructor(
    public readonly id: string,
    public name: string,
    public email: string,
  ) {}
}

// --- user-create.input.ts ---
export type UserCreateInput = Readonly<{ name: string; email: string }>
// Data carriers use type alias — no interface needed

// --- user.repository.impl.ts ---
export class MongoUserRepository implements UserRepository {
  // single implementation, but UserRepository is a cross-module contract → keep the interface
}
```

#### Interface Convergence Checklist

Before adding or keeping an interface, answer three questions:
1. Will this interface be implemented by two or more classes? (No → don't use interface)
2. Does this interface have an external consumer? (No → don't use interface, or at least don't export it)
3. Can related interfaces be merged into a single contract file? (Yes → merge them, don't scatter)

### Class Usage Principles

- Classes carry state, lifecycle, caching, invariants, and default behavior.
- Subclasses express genuine "is-a" relationships only — do not inherit just to reuse a few methods.
- AI-editable model shape: `docs/ai/AI_MODEL_SPEC.md` (single `SparkAIModel` stack only; no parallel snapshot models such as DataSet/SparkNodeTree for LLM editing; page files are `PageConfigModel` string fields; LLM projection reads fields/methods/JSDoc directly).

### Class Naming & Organization Hierarchy

Core stance: **Class names MUST reflect domain hierarchy, not flat peer-level naming.** Class files flat in one directory, class names with no hierarchy prefix, related classes scattered — this is the "class flat-land" anti-pattern.

#### Class Naming Hierarchy Rules

- Classes in the same domain MUST share a common naming prefix or suffix that expresses hierarchy. For example, `PageNodeFileApi`, `PageNodeFileCache`, `PageNodeFileCreator` share the `PageNodeFile` prefix → they belong to the same subdomain and should live under a `page-file/` subdirectory.
- Do NOT place 5+ classes without a common prefix in the same directory — this signals unclear domain boundaries.
- Subclass naming MUST express the "is-a" relationship: `MongoUserRepository` implements `UserRepository`, not `UserRepositoryImpl`.

#### Class Naming Dictionary Layering Rules (Mandatory)

Core stance: **Class names MUST reflect domain paths (dictionary-style), NOT free combinations of orthogonal dimensions (matrix-style).**

**Dictionary-style naming**: class name = domain path + domain-internal role. The left side is a stable domain hierarchy path; the right side is a natural specialization within that domain.

```
✅ Dictionary-style: domain path → role

PageFileReader       → domain path=PageFile, role=Reader
PageFileWriter       → domain path=PageFile, role=Writer
PageFileCache        → domain path=PageFile, role=Cache
DataSetValidator     → domain path=DataSet, role=Validator
DataSetTransformer   → domain path=DataSet, role=Transformer
```

Characteristics:
- Adding a new role within a domain does not affect class names in other domains
- Directory structure maps 1:1 to naming — `PageFileReader` naturally belongs under `page-file/`
- Name length reflects hierarchy depth only, not dimension combination count

**Matrix-style naming** (PROHIBITED): class name = dimension A × dimension B × role. Cartesian product of orthogonal dimensions.

```
❌ Matrix-style: dimensionA × dimensionB × role

Dim1 (storage): Mongo / Redis / Memory
Dim2 (entity):  User / Order / Product
Dim3 (role):    Repository / Service / Controller

→ MongoUserRepository, MongoOrderRepository, RedisUserRepository...
→ 3×3×3 = 27 class names, no hierarchy, just combinations
```

Characteristics:
- Any two segments in the class name can be independently swapped to produce a valid new name → matrix-style
- Adding one dimension value (e.g., `Postgres`) causes class name explosion
- Directory structure cannot group naturally — "group by storage" and "group by entity" both make sense but neither is complete
- Name length grows linearly with dimension count

**Mandatory rules:**

1. Class name structure MUST be `[DomainPath][Role]`, NOT `[DimA][DimB][Role]`.
2. Domain path MUST map 1:1 to directory path: `PageFileXxx` → `page-file/` subdirectory. `PageFileXxx` MUST NOT appear in the root directory.
3. Role suffix MUST be meaningful within the domain — it cannot be reused as an independent dimension across domains.
4. When adding a class, first determine which existing domain path it belongs to — if it belongs to an existing domain, use that domain prefix and place it in the corresponding subdirectory; if it belongs to no existing domain, create the new domain subdirectory first; NEVER throw an unprefixed class into the root directory.
5. Implementation details (storage backend, serialization format, transport protocol, etc.) MUST NOT appear as naming dimensions. In `MongoUserRepository`, `Mongo` is an implementation detail, not a domain path — the correct approach is `UserRepository` as the domain class with `Mongo` as a constructor parameter or configuration, not part of the class name.

**Matrix-style naming detection signals:**

- The same prefix segment appears in multiple class names but does not belong to the same domain → matrix-style
- Any two segments in the class name can be independently swapped to produce a valid new name → matrix-style
- Class name exceeds 3 segments (A-B-C-Role) and the first 2+ segments are orthogonal dimensions → matrix-style
- Adding one dimension value (e.g., a new storage backend) requires creating new classes for all domains → matrix-style

**Anti-Pattern: Matrix-Style Naming**

```ts
// ❌ PROHIBITED: Cartesian product of 3 orthogonal dimensions

// Dim1 (storage) × Dim2 (entity) × Dim3 (role)
export class MongoUserRepository { /* ... */ }
export class MongoOrderRepository { /* ... */ }
export class RedisUserRepository { /* ... */ }
export class RedisOrderRepository { /* ... */ }
export class MemoryUserRepository { /* ... */ }
export class MemoryOrderRepository { /* ... */ }

// Add Postgres → must write PostgresUserRepository, PostgresOrderRepository...
// Add Product entity → must write MongoProductRepository, RedisProductRepository...
// 2×2 = 6 classes already; 3×3 = 27 classes — dimension explosion
```

**Correct Pattern: Dictionary-Style Layered Naming**

```ts
// ✅ CORRECT: domain path + role; implementation details do NOT enter class names

// --- user/user-repository.ts ---
export class UserRepository {
  // domain path=User, role=Repository
  // Storage backend injected via constructor — not part of class name
  constructor(private readonly store: DataStore) {}
}

// --- user/user-service.ts ---
export class UserService {
  // domain path=User, role=Service
}

// --- order/order-repository.ts ---
export class OrderRepository {
  // domain path=Order, role=Repository
  constructor(private readonly store: DataStore) {}
}

// --- order/order-service.ts ---
export class OrderService {
  // domain path=Order, role=Service
}

// Add Postgres → only need a new DataStore implementation, no class names change
// Add Product → new product/ subdirectory + ProductRepository, no impact on user/ or order/
```

**Dictionary Layering Checklist:**

When adding or renaming a class, answer these questions in order:

1. **What is the domain path?** — the leftmost consecutive PascalCase segments (e.g., `PageFile`)
2. **What is the role?** — the rightmost segment (e.g., `Reader`, `Validator`)
3. **Are there independently swappable dimensions in the middle?** — if yes, the naming violates dictionary layering and must be reorganized
4. **Does the directory path match the domain path?** — `PageFileXxx` → `page-file/` subdirectory
5. **Does adding a new dimension value cause class name explosion?** — if adding a storage backend requires renaming classes across all domains, that dimension is an implementation detail and MUST NOT enter the class name

#### Class File Organization Rules

- When a directory exceeds **7 class files**, it MUST be split into subdirectories by domain.
- Classes sharing a clear prefix (e.g., `XxxDelegate`, `XxxAiModule`, `XxxModel`) MUST be placed in a subdirectory named after that prefix.
- One class per file, but related classes MUST co-reside in the same subdirectory, not be scattered across different directories.

#### Anti-Pattern: Class Flat-Land

```ts
// ❌ PROHIBITED: 8 Delegate classes flat in strategies/, no subdirectory grouping

// --- strategies/AggregateDelegate.ts ---
export class AggregateDelegate { /* ... */ }

// --- strategies/CascadeDelegate.ts ---
export class CascadeDelegate { /* ... */ }

// --- strategies/ComputedColumnDelegate.ts ---
export class ComputedColumnDelegate { /* ... */ }

// --- strategies/CrudDelegate.ts ---
export class CrudDelegate { /* ... */ }

// --- strategies/DirtyTrackingDelegate.ts ---
export class DirtyTrackingDelegate { /* ... */ }

// --- strategies/LocalMutationDelegate.ts ---
export class LocalMutationDelegate { /* ... */ }

// --- strategies/PrimaryKeyDelegate.ts ---
export class PrimaryKeyDelegate { /* ... */ }

// --- strategies/SelectionDelegate.ts ---
export class SelectionDelegate { /* ... */ }

// 8 Delegates, all flat, not grouped by responsibility (data integrity vs mutation tracking vs UI).
// When adding a new Delegate, developers don't know where to put it — they just keep dumping into strategies/.
```

#### Correct Pattern: Class Domain Layering

```ts
// ✅ CORRECT: split into subdirectories by responsibility, class names retain domain prefix

// --- strategies/data-integrity/PrimaryKeyDelegate.ts ---
export class PrimaryKeyDelegate { /* ... */ }

// --- strategies/data-integrity/CascadeDelegate.ts ---
export class CascadeDelegate { /* ... */ }

// --- strategies/data-integrity/ComputedColumnDelegate.ts ---
export class ComputedColumnDelegate { /* ... */ }

// --- strategies/data-integrity/AggregateDelegate.ts ---
export class AggregateDelegate { /* ... */ }

// --- strategies/mutation/CrudDelegate.ts ---
export class CrudDelegate { /* ... */ }

// --- strategies/mutation/DirtyTrackingDelegate.ts ---
export class DirtyTrackingDelegate { /* ... */ }

// --- strategies/mutation/LocalMutationDelegate.ts ---
export class LocalMutationDelegate { /* ... */ }

// --- strategies/ui/SelectionDelegate.ts ---
export class SelectionDelegate { /* ... */ }

// Responsibilities are clear. A new Delegate immediately has an obvious home.
// Each subdirectory has ≤ 4 files — clear at a glance.
```

### File & Directory Organization Rules (Mandatory)

Core stance: **Files organize by domain hierarchy, not by flat type grouping.** Twenty or thirty files at the same level in a directory with no subdirectory grouping — this is the "file flat-land" anti-pattern.

#### Hard File Count Limit

- A single directory MUST NOT contain more than **10 `.ts`/`.vue` files** (excluding `index.ts` barrel files).
- Beyond 10 files, the directory MUST be split into subdirectories by domain or feature.
- Test files are subject to the same rule — when a test directory exceeds 10 test files, it MUST be split into subdirectories by the module under test.

#### File Naming Prefix Rule

- When 3 or more files share the same prefix (e.g., `page-file-api.ts`, `page-file-cache.ts`, `page-file-creator.ts`), those files constitute a subdomain and MUST be grouped into a subdirectory named after that prefix.
- Anti-pattern: 6 `page-file-*.ts` files and 4 `page-*-model.ts` files all flat in `model/` — should be split into `model/page-file/` and `model/page-model/`.

#### Component File Pairing Rule

- `.props.ts` + `.vue` paired files (e.g., `FieldText.props.ts` + `FieldText.vue`) MUST be placed in a component-specific subdirectory.
- Anti-pattern: 60 files (30 `.vue` + 30 `.props.ts`) all flat in `data-components/`.
- Correct: `data-components/FieldText/` contains only `FieldText.props.ts` + `FieldText.vue`.

#### Anti-Pattern: File Flat-Land

```
// ❌ PROHIBITED: 60 files flat in data-components/
data-components/
  FieldAutocomplete.props.ts
  FieldAutocomplete.vue
  FieldCascader.props.ts
  FieldCascader.vue
  FieldCheckbox.props.ts
  FieldCheckbox.vue
  ... (54 more files)
  index.ts
```

#### Correct Pattern: Per-Component Subdirectory

```
// ✅ CORRECT: one subdirectory per component
data-components/
  basic/
    FieldText/
      FieldText.props.ts
      FieldText.vue
    FieldNumber/
      FieldNumber.props.ts
      FieldNumber.vue
  selection/
    FieldSelect/
      FieldSelect.props.ts
      FieldSelect.vue
    FieldCheckbox/
      FieldCheckbox.props.ts
      FieldCheckbox.vue
  index.ts
```

### Folder Hierarchy Rules

Core stance: **Folders group by domain, not flat peer-level.** Sibling directories exceeding a threshold with no parent-child grouping — this is the "folder flat-land" anti-pattern.

#### Sibling Directory Count Limit

- A single directory level MUST NOT contain more than **7 subdirectories** (excluding files).
- Beyond 7 subdirectories, they MUST be merged into parent grouping directories by domain or concern.

#### Directory Naming Hierarchy

- Directory names MUST reflect domain ownership, forming a coarse-to-fine hierarchy path.
- Anti-pattern: 13 files + 0 subdirectories under `src/services/`, with AI, auth, and project services all flat.
- Correct: `src/services/ai/`, `src/services/auth/`, `src/services/project/` — three-level grouping.

#### Anti-Pattern: Folder Flat-Land

```
// ❌ PROHIBITED: 13 service files + 0 subdirectories
services/
  ai-host.ts
  ai-host-run-bridge.ts
  ai-turn-bridge.ts
  page-design-ai-runner.ts
  page-design-host-run-provider.ts
  sse-events.ts
  auth.ts
  http.ts
  api-paths.ts
  project-switch.ts
  project-ui-settings.ts
  tenant-scope.ts
```

#### Correct Pattern: Domain Grouping

```
// ✅ CORRECT: three-level domain grouping, ≤ 7 entries per level
services/
  ai/
    ai-host.ts
    ai-host-run-bridge.ts
    ai-turn-bridge.ts
  page-design/
    page-design-ai-runner.ts
    page-design-host-run-provider.ts
  project/
    project-switch.ts
    project-ui-settings.ts
    tenant-scope.ts
  auth.ts
  http.ts
  api-paths.ts
  sse-events.ts
```

### Flat-Land Convergence Checklist

Before adding a class, file, or directory, answer three questions:
1. Does the sibling directory exceed 7 files/subdirectories? (Yes → split into subdirectories first, then add)
2. Do 3 or more existing files/classes share the same prefix? (Yes → they should be grouped into a subdirectory)
3. Does this new class/file belong to the same subdomain as existing code? (Yes → place it in the corresponding subdirectory, not at the root level)

### Generics Usage Principles

- Use generics only when the caller gains real type-safety benefit.
- More than two generic parameters → prefer named business types or classes.

## 2. Function Signature Constraints (Mandatory)

### Parameter Count

- Functions/methods default to a maximum of **3 positional parameters**.
- 4+ parameters MUST become an **options object / command object / domain object** (named type, single-parameter).
- Do not flatten multiple callbacks, context values, or optional fields into the parameter list; bundle them into one named type/class.
- Constructors using `public readonly` parameter properties allow up to 4 parameters; beyond that, also split into an options object.

### No Inline JSDoc in Parameters

- Do NOT embed `/** */` JSDoc comments inside parameter lists. Move parameter documentation above the class definition or onto the type definition.
- Anti-pattern:

```ts
// ❌ PROHIBITED: inline JSDoc bloats a 4-param constructor to 10 lines
public constructor(
  /** Severity level */
  public readonly level: ModuleCheckEntryLevel,
  /** Machine-readable error code */
  public readonly code: string,
  /** Human-readable description */
  public readonly message: string,
  /** Optional fix suggestion */
  public readonly hint?: string | undefined,
) {}
```

- Correct:

```ts
// ✅ CORRECT: doc above class, one param per line
/**
 * A minimal diagnostic entry for an operation result.
 * level   — severity (error / warn / info)
 * code    — machine-readable error code
 * message — human-readable description
 * hint    — optional fix suggestion
 */
public constructor(
  public readonly level: ModuleCheckEntryLevel,
  public readonly code: string,
  public readonly message: string,
  public readonly hint?: string,
) {}
```

### No Anonymous Inline Object Types

- Object-literal parameter types MUST be extracted as named types.
- Anti-pattern:

```ts
// ❌ PROHIBITED: anonymous inline object bloats the signature
export function objectSchema(
  properties: Readonly<Record<string, LlmJsonSchema>> = {},
  options: {
    required?: readonly string[]
    description?: string
    additionalProperties?: LlmJsonSchema
  } = {},
): LlmJsonSchemaObject {
```

- Correct:

```ts
// ✅ CORRECT: inline type extracted as named type
export type ObjectSchemaOptions = Readonly<{
  required?: readonly string[]
  description?: string
  additionalProperties?: LlmJsonSchema
}>

export function objectSchema(
  properties: Readonly<Record<string, LlmJsonSchema>>,
  options: ObjectSchemaOptions,
): LlmJsonSchemaObject {
```

### Deep Generic Extraction

- Generics nested 2+ levels deep (e.g., `Readonly<Record<string, LlmJsonValue>>`) MUST be extracted as named type aliases.
- Anti-pattern: `args: Readonly<Record<string, LlmJsonValue>>` (repeated in multiple places).
- Correct: first define `export type LlmJsonArgs = Readonly<Record<string, LlmJsonValue>>`, then reuse.

### Optional Parameter Syntax

- Use `hint?: string`, NOT `hint?: string | undefined`.
- TypeScript's `?` already implies `| undefined`; the explicit form is redundant.

## 3. Export Constraints

- Public exports MUST have clear consumers. Internal helpers, contexts, options, providers, and resolvers should NOT be exported for testing or future extension.
- Normal business flows should need at most 1–3 public imports. If callers must import a chain of internal parts, converge through a facade first.
- Public barrel files MUST use explicit exports — `export *` is FORBIDDEN.
- When modifying a public entry point, update package exports, TS paths, Vite/Vitest aliases, and import smoke tests together.

## 4. Error Handling

- Do NOT add silent fallbacks that mask missing APIs, invalid configs, or state inconsistencies. Errors should fail fast or be returned to the LLM for correction.
- Missing capabilities, illegal configurations, and state conflicts MUST fail explicitly.

## 5. Comment Conventions

- Comments explain contracts, constraints, priorities, and risks only — do not narrate obvious code line by line.
- VCM/LLM-visible semantics MUST be annotated with natural-language comments and structured tags at the first declaration site.
- Do not use comments to justify silent fallbacks.

## 6. Hard Gates

- `pnpm run verify:rules` MUST pass.
- Forbidden: non-allowlist `interface` proliferation, `Interface/Impl` mechanical naming, TypeScript `namespace`.
- Forbidden: non-`as const` type assertions and angle-bracket type assertions.
- Forbidden: legacy `@spark-appworks/spark-ai/core`, `/protocol`, `/runtime`, `/adapter` subpaths.
- Forbidden: legacy `ModuleKind.PathContext`, `ModuleKind.OperationResult` namespace types.
- Framework-agnostic packages MUST NOT import Vue, Vue Router, Element Plus, VueUse, or Pinia.
- Cross-package relative imports that bypass `@spark-appworks/*` are FORBIDDEN between workspace packages.
- **Single-directory file limit**: A single directory MUST NOT exceed 10 `.ts`/`.vue` files (excluding `index.ts`); beyond that, split into subdirectories.
- **Single-directory subdirectory limit**: A single directory level MUST NOT exceed 7 subdirectories; beyond that, merge into parent grouping directories by domain.
- **Class naming hierarchy**: 5+ independent classes without a common prefix in the same directory signals unclear domain boundaries — split into subdirectories.
- **Class naming dictionary layering**: class names MUST be `[DomainPath][Role]` (dictionary-style); multi-orthogonal-dimension concatenation (matrix-style) is FORBIDDEN; implementation details (storage backend, serialization format, transport protocol) MUST NOT appear as naming dimensions.
- **Component file pairing**: `.props.ts` + `.vue` paired files MUST go into a component-specific subdirectory; flat-dumping in the parent directory is FORBIDDEN.
- **Test file hierarchy**: Test directories are subject to the same file and directory count limits above.

## 7. References

For the VCM metadata generation chain, see `packages/vite-plugin-spark-catalog/README.md`; for repository verification commands, see the root `package.json`.
