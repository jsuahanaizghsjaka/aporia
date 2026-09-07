# Aporia project instructions

## Visual quality

- Use the globally installed `design-taste-frontend` skill automatically for every task involving Aporia's brand, landing pages, typography, color, layout, motion, or frontend visual polish. Do not ask for confirmation before using it.
- Start visual work with the skill's Design Read and explicit `DESIGN_VARIANCE`, `MOTION_INTENSITY`, and `VISUAL_DENSITY` values.
- Run the skill's pre-flight review before considering a visual surface complete.
- After visual UI code changes, automatically run `web-design-guidelines` against the changed files and address its applicable findings. Fetch its current rules before every review.
- Automatically use the installed `impeccable` skill for design-token discipline, interaction states, accessibility, and QA. Its warm editorial amber direction applies only when it matches Aporia's chosen brand direction.
- After UI changes, automatically verify the relevant local flow using `playwright-cli` in desktop and mobile viewports, inspect console errors, and capture a screenshot when visual inspection is useful. Use isolated sessions by default and close them after verification.
- For codebase architecture, file relationships, and data-flow questions, automatically use `graphify`. Build the initial graph only for the first relevant deep analysis; then query or incrementally update it rather than rebuilding.
- Avoid generic AI aesthetics, default shadcn styling, repetitive card grids, decorative UI with no product meaning, and invented metrics.
- Keep one coherent Aporia palette, type system, icon family, radius system, and motion language across the project.
- Respect the skill's scope: for dense application screens, dashboards, and multi-step flows, apply its brand and quality principles while using appropriate product-interface patterns.

## Product continuity

- Treat `PRODUCT_CONTEXT.md`, `MVP.md`, `IN_MVP.md`, and `NOT_IN_MVP.md` as the current product source of truth.
- Preserve the narrow MVP: one learner profile, one Python backend track, one daily learning loop, evidence-based mastery, and persistent learning memory.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
