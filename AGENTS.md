# AGENTS.md

## Purpose
- This repository contains an Obsidian plugin named `obsidian-file-cooker`.
- The plugin performs batch note operations from several input sources: current file links, clipboard contents, Dataview queries, search results, and canvas-related flows.
- Agentic coding agents should prefer small, pattern-matching changes that fit the existing architecture instead of broad refactors.

## Repository layout
- `main.ts`: plugin entrypoint, settings, and command registration bootstrap.
- `src/command/`: command registration classes grouped by input source.
- `src/reader/`: readers that collect files/content and pass `ActionModel[]` into actions.
- `src/action/`: action implementations such as move, rename, delete, merge, sync, and canvas operations.
- `src/modal/`: confirmation and picker modals used by actions and commands.
- `src/backup/`: backup & undo module — `backup-service.ts` (snapshot/commit/revert/drift/retention + singleton), `undo-record.ts` (data model + manifest serialization), `backup-settings.ts` (defaults + deep merge + settings UI).
- `src/utils/`: small utility helpers.
- `tests/`: vitest tests; `tests/mocks/obsidian.ts` (Obsidian API mocks) and `tests/mocks/vault-mock.ts` (in-memory vault/fileManager for backup tests).
- `manifest.json`, `versions.json`: Obsidian plugin metadata.
- `esbuild.config.mjs`: bundling config.

## Rules files discovered
- No `.cursor/rules/` directory was found.
- No `.cursorrules` file was found.
- No `.github/copilot-instructions.md` file was found.
- Therefore, this AGENTS.md is the main agent guidance file for this repository.

## Install and environment
- Package manager: `npm`
- Language: TypeScript
- Bundler: `esbuild`
- Runtime target: Obsidian plugin environment, bundled as CommonJS in `main.js`
- Important dependency types come from `obsidian` and `obsidian-dataview`

## Build, lint, and test commands

### Install dependencies
```bash
npm install
```

### Development build with watch
```bash
npm run dev
```
- Runs `node esbuild.config.mjs`
- Watches files and rebuilds `main.js`

### Production build
```bash
npm run build
```
- Runs `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`
- Intended to type-check then bundle for release.

### Version bump helper
```bash
npm run version
```
- Updates `manifest.json` and `versions.json`, then stages them.

### Lint
- There is an ESLint config file at `.eslintrc`, but there is no `lint` script in `package.json`.
- There is also no direct `eslint` package declared at the top level of `package.json`.
- Do **not** assume `npm run lint` exists.
- If linting is needed, first add an explicit lint script and dependency in a dedicated change.

### Tests
- The repository uses **vitest** with `npm test` (`vitest run`).
- `tests/mocks/obsidian.ts` replaces the `obsidian` module in tests via `vi.mock('obsidian', ...)` + the `obsidian` alias in `vitest.config.mjs`.
- `tests/mocks/vault-mock.ts` provides an in-memory `VaultMock` / `FileManagerMock` / `createAppMock` for backup-service and modal integration tests.
- Backup & undo behavior lives in `tests/backup/` (`undo-record`, `backup-service`, `undo-history-modal`, `modal-integration`).
- Do **not** claim tests were run unless `npm test` actually ran.

### Running a single test
```bash
npx vitest run <path-to-test-file>          # e.g. tests/backup/backup-service.test.ts
npx vitest run <path> -t "<test name"       # filter by test name
```

## Current command reality check
- `npm run build` passes in this environment (`tsc -noEmit -skipLibCheck && esbuild production`).
- `npm test` passes with vitest (all test files green).
- Treat build verification as real: always run `npm run build` after build-affecting changes.

## Architecture conventions
- The codebase follows a clear pipeline:
  1. A command class registers an Obsidian command.
  2. A reader collects files or content.
  3. The reader constructs `ActionModel[]`.
  4. An action opens a modal or executes the operation.
- Preserve that separation when adding features.
- New batch operations should usually be added as a new `Action` plus wiring from one or more existing readers/commands.
- New selection sources should usually be added as a new `Readable` implementation.

## Backup & undo conventions
- All batch write operations (properties / move / rename / delete / merge / create) go through the backup channel: `getBackup().begin(opType, opLabel)` in the modal apply branch, per-file `snapshot*` calls, then `finish()` on success / `abort()` on failure.
- `src/backup/backup-service.ts` exposes a module-level singleton via `initBackup(app, settings)` (called from `main.ts onload`) and `getBackup()`; `__resetBackupForTest()` resets it in tests.
- Blob files and `manifest.json` are written through `vault.adapter` (no vault events); manifest commit is atomic (temp file + rename).
- Revert supports per-file selection and drift detection; drift entries are never silently overwritten (force flag required).
- Backup storage lives in a vault folder (default `.file-cooker/backups`, dot-prefixed and hidden); retention (default 20) cleans up the oldest records.

## Import conventions
- Existing code mixes single and double quotes, but many command files use single quotes consistently.
- Existing imports are grouped as:
  - external/Obsidian imports first
  - project absolute imports such as `src/...` and `main`
  - local relative imports last
- Follow the existing import path style already used in nearby files.
- The repository uses absolute-style imports like `src/...` and `main`; do not rewrite them to deep relative imports unless required.
- When editing an existing file, match that file's quote style instead of reformatting unrelated imports.

## Formatting conventions
- `.editorconfig` is the strongest formatting authority present.
- Use tabs for indentation.
- Indent width: 4.
- Use LF line endings.
- Insert a final newline at end of file.
- Keep formatting minimal and consistent with surrounding code.
- Avoid repo-wide formatting churn.

## TypeScript and typing guidelines
- `tsconfig.json` has `noImplicitAny: true`.
- Prefer explicit parameter and property types when inference is weak.
- Reuse existing interfaces such as `Action`, `Command`, `Readable`, `MoveInfo`, and `ActionModel`.
- Prefer narrow domain types over `any`.
- If interacting with weakly typed Obsidian or Dataview APIs, isolate unsafe assumptions in small sections.
- Preserve existing method signatures where interfaces require them, e.g. `regist(): void`, `read(action: Action): void`, `act(actionModels: ActionModel[])`.
- Avoid introducing unnecessary generics or abstractions.

## Naming conventions
- Classes use PascalCase: `CurrentFileReader`, `EditPropertiesAction`.
- Interfaces use PascalCase: `Action`, `Command`, `Readable`.
- Methods and variables use camelCase.
- File names use kebab-case, generally ending in role suffixes like:
  - `*-command.ts`
  - `*-reader.ts`
  - `*-action.ts`
  - `*-modal.ts`
- Match existing naming, including the project's existing `regist*` method spelling; do not silently rename these methods unless doing a deliberate refactor everywhere.

## Error handling conventions
- User-facing failures are commonly surfaced via `new Notice(...)`.
- Many readers wrap parsing/collection logic in `try/catch` and show `e.message`.
- Preserve user-visible notices for invalid state such as:
  - no active file
  - no files found
  - invalid query or clipboard content
  - remote sync failure
- Prefer graceful failure with a notice over throwing uncaught runtime errors in UI-triggered flows.
- Throw `Error` mainly in lower-level helpers when enforcing invariants, as `ReadInfo` currently does.

## Async guidelines
- Many modal confirm handlers are async and perform Obsidian vault I/O.
- Use `await` for vault reads/writes and network calls inside UI flows.
- Close modals before long-running operations when that matches existing behavior.
- If adding network behavior, preserve the current pattern of checking `response.ok` and notifying the user.

## Obsidian-specific guidance
- This is an Obsidian plugin, so many flows depend on `this.app`, `vault`, `workspace`, `metadataCache`, and modal APIs.
- Keep UI-driven operations interactive; most destructive actions should remain confirmation-based.
- New commands should be registered from the appropriate command class rather than directly in `main.ts` unless the command is truly global bootstrap behavior.

## Dataview-specific guidance
- Dataview support already handles both DQL and some DataviewJS-like `.pages(...)` parsing.
- Be conservative when changing Dataview logic; it contains custom string parsing and task-specific behavior.
- Preserve support for task output mode where content is generated instead of file lists.

## When making changes
- Prefer scoped edits in the nearest relevant file.
- Update existing patterns instead of introducing a second architecture.
- Avoid unnecessary renames, mass quote changes, or mass import sorting.
- If a requested feature touches multiple input sources, implement the shared action once and wire it into each needed command class.
- If you add tooling such as lint or tests, also update this file with exact commands.

## Validation expectations for agents
- Minimum useful validation today:
  - inspect changed TypeScript for interface compatibility
  - verify imports and file paths match existing repo style
  - if build-related changes were made, run `npm run build` and report real results
- Do not say lint or tests passed unless the corresponding tooling actually exists and was run.

## Known repository gaps
- No AGENTS-specific secondary rule files are present.
- No lint script is configured (eslint config exists but no runner script).
- Automated tests are configured (vitest) and passing; `npm run build` passes.

## Practical recommendation for future contributors
- If you need stronger agent reliability, first add an `npm run lint` script; the type-check setup and vitest runner already work.
- Until then, favor minimal, architecture-consistent changes and explicit reporting of what was and was not validated.
