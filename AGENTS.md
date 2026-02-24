# Repository Guidelines

## Project Structure & Module Organization

- `src/`: TypeScript source (ESM).
  - `src/actions/`: Stream Deck action implementations (one file per action).
  - `src/agents/`: Agent adapters (Claude Code, terminal integration, state aggregation).
  - `src/utils/`: Shared utilities (notably `claude-controller`).
- `com.anthropic.claude-deck.sdPlugin/`: Stream Deck plugin bundle.
  - `manifest.json`: Action registration and metadata.
  - `imgs/`: Plugin + action icons.
  - `ui/`: Property inspector HTML pages.
  - `bin/`: Build output (generated; don’t hand-edit).
- `hooks/`: Hook scripts installed into Claude Code.
- `scripts/`: Install/uninstall and hook verification helpers.
- `docs/`, `assets/`: Documentation and design assets.

## Build, Test, and Development Commands

```bash
npm install           # install dependencies (Node 20+)
npm run build         # bundle plugin with Rollup
npm run watch         # rebuild on changes
npm run typecheck     # TypeScript (strict) checks
npm run lint          # ESLint checks
./scripts/install.sh  # build + install hooks + install plugin (macOS)
./scripts/test-hooks.sh # sanity-check hook wiring
./scripts/uninstall.sh  # remove installed artifacts
```

## Coding Style & Naming Conventions

- TypeScript, ESM imports, and `strict` typechecking; avoid `any` and keep types explicit.
- Follow existing formatting (2-space indentation, semicolons).
- Action files use kebab-case (e.g. `src/actions/mode-cycle.ts`) and export `*Action` classes.
- Action IDs follow `com.anthropic.claude-deck.<action>` in `com.anthropic.claude-deck.sdPlugin/manifest.json`.
- Property inspectors live in `com.anthropic.claude-deck.sdPlugin/ui/` and typically end with `-pi.html`.

## Testing Guidelines

- No unit test runner is configured; treat `npm run typecheck` + `npm run lint` as the required gate.
- For behavior changes, do a manual smoke test via `./scripts/install.sh`, then validate in Stream Deck (icons, key events, and live state updates).

## Commit & Pull Request Guidelines

- Commit subjects use short, imperative phrasing (e.g. “Add X, fix Y”); keep commits focused and easy to review.
- PRs should include: a clear description, linked issue (if any), what you tested (actions + terminal), and screenshots/GIFs for UI or icon changes.

## Security & Configuration Tips

- Installer scripts write user state under `~/.claude-deck/` and modify Claude Code hook config under `~/.claude/`; never commit user-generated state/config files.
- Terminal/AppleScript automation may require macOS Accessibility permissions; call this out in PR notes when relevant.
