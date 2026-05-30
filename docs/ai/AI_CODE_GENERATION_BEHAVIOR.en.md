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
- Forbidden: legacy `@spark-view/spark-ai/core`, `/protocol`, `/runtime`, `/adapter` subpaths.
- Forbidden: legacy `ModuleKind.PathContext`, `ModuleKind.OperationResult` namespace types.
- Framework-agnostic packages MUST NOT import Vue, Vue Router, Element Plus, VueUse, or Pinia.
- Cross-package relative imports that bypass `@spark-view/*` are FORBIDDEN between workspace packages.

## 7. References

For detailed business context and verification commands, see `docs/ai/spark-ai-complete-guide.md`.
