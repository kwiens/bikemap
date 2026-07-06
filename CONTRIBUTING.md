# Contributing to Open Bike Map

Thanks for your interest in improving Open Bike Map. This guide covers
contributing to the codebase. If you want to stand up a deployment for your own
community, see the README's "Deploying for your community" section.

## Ground rules

- For anything beyond a small fix — a new capability, a pipeline change, a new
  community deployment — **open an issue first** so we can agree on the shape
  before you invest time.
- Be kind. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

**Prerequisites:** Node.js 20+ and pnpm 10+.

```bash
git clone https://github.com/kwiens/bikemap.git
cd bikemap
pnpm install
cp .env.example .env.local      # add your Mapbox token — see .env.example
pnpm dev                        # http://localhost:3000
```

You need a free [Mapbox](https://account.mapbox.com/access-tokens/) public
token for the map to render.

## Making a change

1. Fork the repo and create a feature branch off `main`.
2. Make your change, with tests where it makes sense.
3. Run the full check locally — CI runs the same:
   ```bash
   pnpm test:run && pnpm lint
   ```
4. Open a PR against `main` and fill in the template.

## Code style

Linting and formatting are enforced (Biome + ESLint, `--max-warnings 0`).
Run `pnpm lint:fix` to auto-fix most issues. Beyond that:

- Use the `function` keyword for components and pure functions.
- Prefer `interface` over `type` aliases; avoid `enum` (use object maps).
- Functional components only; keep `'use client'` to the components that need it.
- File order: exported component → subcomponents → helpers → static content → types.
- Use the existing icon libraries (Font Awesome, lucide-react) — don't add more.
- Style with Tailwind utilities; directories use `lowercase-dash` names.
- Write comments only for non-obvious *why*, not *what*.

## Testing

Tests live next to their source as `*.test.ts(x)` and run under Vitest + jsdom.

```bash
pnpm test         # watch mode
pnpm test:run     # single run (CI)
```

Mapbox layer-click events cannot be triggered synthetically in tests. To
exercise map-driven behavior, dispatch the relevant custom event from
`src/events.ts` directly — see existing tests for the pattern.

## Commit messages

Write clear, imperative commit messages that explain *why* a change was made.
Keep the subject under ~70 characters; put detail in the body.
