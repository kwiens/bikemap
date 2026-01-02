# Repository Guidelines

## Project Structure & Module Organization
- `src/app`: Next.js App Router pages, layouts, and route-level styles (`globals.css`, `map.css`).
- `src/components`: React UI and map components; UI primitives live under `src/components/ui`.
- `src/hooks`: custom React hooks (e.g., `use-mobile.tsx`).
- `src/data`: static data and API helpers (e.g., `gbfs.ts`, `geo_data.ts`).
- `src/lib` and `src/utils`: shared helpers and utilities.
- `public`: static assets served as-is.

## Build, Test, and Development Commands
- `pnpm dev`: start the local Next.js dev server at `http://localhost:3000`.
- `pnpm build`: produce the production build.
- `pnpm start`: run the production server from the build output.
- `pnpm lint`: run ESLint plus Biome lint + format checks (fails on warnings).
- `pnpm lint:fix`: auto-fix lint issues and format code.

## Coding Style & Naming Conventions
- TypeScript + React with Next.js App Router.
- Formatting and linting are enforced via Biome and ESLint (`eslint.config.mjs`).
- Biome uses 2-space indentation, single quotes, semicolons, and 80-char line width.
- Use `function` for components and pure functions; avoid classes.
- Prefer interfaces over type aliases and avoid enums (use maps instead).
- Prefer named exports for components and utilities.
- Filenames: components are `PascalCase.tsx` in `src/components`; hooks use `use-*.tsx` in `src/hooks`.
- Directory names should be lowercase-dash (e.g., `components/map-legend`).
- Prefer colocating component-specific CSS near the component (e.g., `src/components/map-legend.css`).
- File order: exported component → subcomponents → helpers → static content → types.
- Favor guard clauses and early returns; avoid deep nesting and unnecessary `else`.
- Use the RORO pattern (Receive an Object, Return an Object) for complex functions.

## React & Next.js Practices
- Minimize `use client`; default to server components and Next.js data fetching.
- Extract complex state/data logic into hooks and keep hooks self-contained.
- Keep component logic top-down (main component, then details) for readability.

## Testing Guidelines
- No dedicated test framework is configured in this repository yet.
- If you add tests, document the framework and add scripts to `package.json`.

## Commit & Pull Request Guidelines
- Commit messages follow short, imperative sentence case (e.g., “Update packages…”).
- Pull requests should include a clear description, linked issues, and screenshots for UI changes.
- Ensure `pnpm lint` passes before requesting review.

## Configuration & Secrets
- Mapbox credentials belong in `.env.local`; see `.env.example` for required keys.
- Never commit secrets or `.env.local` to version control.
