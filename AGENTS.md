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
- `src/utils/`: small utility helpers.
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
- There is currently **no test framework configured**.
- No Jest/Vitest config files were found.
- No `test` script exists in `package.json`.
- Do **not** claim tests were run unless you first add a test runner.

### Running a single test
- Not currently possible in the repository's present state because no test framework or test script is configured.
- If tests are added later, document the exact single-test command here and in `package.json`.

## Current command reality check
- `npm run build` currently fails in this environment.
- Main failure reason: TypeScript cannot resolve `obsidian` types and many Obsidian API-derived members.
- Treat build verification carefully; if you modify build tooling, verify whether the repo expects Obsidian-provided type definitions from a different setup.

## Architecture conventions
- The codebase follows a clear pipeline:
  1. A command class registers an Obsidian command.
  2. A reader collects files or content.
  3. The reader constructs `ActionModel[]`.
  4. An action opens a modal or executes the operation.
- Preserve that separation when adding features.
- New batch operations should usually be added as a new `Action` plus wiring from one or more existing readers/commands.
- New selection sources should usually be added as a new `Readable` implementation.

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
- No automated tests are configured.
- No lint script is configured.
- Build currently fails in the present environment due to type-resolution/setup issues.

## Practical recommendation for future contributors
- If you need stronger agent reliability, first add:
  1. a working Obsidian type-check setup,
  2. an `npm run lint` script,
  3. a test runner with a documented single-test command.
- Until then, favor minimal, architecture-consistent changes and explicit reporting of what was and was not validated.
