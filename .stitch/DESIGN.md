# DESIGN.md — G22 Scores · "Tectonic Basalt"

> Stitch design-system source of truth. Synthesised by the `stitch-design`
> skill from the project's live tokens (`src/components/admin/entities/tournament/basalt.css`).
> Stitch MCP is not connected in this environment, so screens are not
> generated here — this file is the spec to feed Stitch (or to keep the
> hand-built React UI consistent).

## Atmosphere / Vibe
Operational, data-dense sports admin console. Dark, calm, "control room"
feel. Minimalist with precise accents — not playful, not brutalist.
Information hierarchy over decoration. Mono type for codes/IDs/metrics,
sans for content.

## Platform
- Web, **desktop-first** (admin), responsive down to mobile (1 → 2 column grids).
- Dark theme is the canonical theme.

## Palette (semantic-first)
| Role | Name | Hex |
|---|---|---|
| App background | Basalt BG | `#0F141A` |
| Surface (cards/panels) | Basalt Surface | `#151B22` |
| Elevated surface (inputs, hover) | Elevated | `#1B232C` |
| Border / divider | Basalt Border | `#26313B` |
| Primary accent (links, focus, selected) | Info Blue | `#38BDF8` |
| Success / CTA / active | Action Green | `#22C55E` |
| Text primary | Ink | `#F4F7FA` |
| Text dim / secondary | Dim | `#98A6B3` |
| Status · draft | Draft | `#98A6B3` |
| Status · published | Published | `#38BDF8` |
| Status · active | Active | `#22C55E` |
| Status · warning | Warning | `#F59E0B` |
| Status · error | Error | `#EF4444` |

Always reference colors by CSS var, never hardcode: `var(--accent-primary)`,
`var(--surface-basalt)`, `var(--surface-elevated)`, `var(--border-basalt)`,
`var(--status-active)`, `var(--text-dim)`.

## Typography
- Sans (content/UI): `Inter` (var `--font-main`).
- Mono (codes, IDs, metrics, bracket match codes like `ORO-SF-1`): `JetBrains Mono` (var `--font-mono`).
- Section labels: 11px, **bold**, UPPERCASE, letter-spacing ~0.12em, color Dim.
- Card title: 14px semibold Ink. Card description: 11px Dim, leading-snug.

## Shape & Elevation
- Radius: `rounded-xl` (12px) for panels/cards, `rounded-lg` (8px) for inputs/controls, `rounded-full` for pills/checks.
- Borders are the primary separation device (1px `--border-basalt`); shadows minimal.
- Selected state = accent border + `bg-[var(--accent-primary)]/12` + `ring-1 ring-[var(--accent-primary)]/40` + a filled circular check (top-right).
- Hover (unselected) = `border-[var(--accent-primary)]/50` + `bg-[var(--surface-elevated)]/60`.

## Core Components
- **SectionHeader**: accent vertical bar (`h-3.5 w-1` `--accent-primary`) + uppercase label + optional dim hint line.
- **OptionCard**: selectable card with leading icon, title, description, and a top-right check that fills on select. Used for any single-choice group (template, crossings, scheduling mode).
- **Config panel**: `rounded-xl border --border-basalt bg-[var(--surface-basalt)]/60 p-3.5`, a `SectionHeader`, then labelled fields (`--surface-elevated` inputs, focus border `--accent-primary`).
- **Primary CTA**: `basalt-btn basalt-btn-primary`, green Action, icon + label, the visually dominant action; destructive actions are quiet outlined red.
- **Status pill**: rounded-full, 10px bold uppercase; active = green tint, idle = dim border.
- **Panel header**: icon chip (36px, accent tint, rounded-lg) + title/subtitle stack + status pill + chevron.

## Layout Rules
- Selection groups: `grid grid-cols-1 sm:grid-cols-2 gap-2`.
- Panel body vertical rhythm: `gap-5`; group inner rhythm `gap-2.5`.
- Actions row separated by a top `border-[var(--border-basalt)] pt-4`.
- Bracket board: horizontal scroll, one column per round, cup sections stacked; cup accent dots (Oro `#f5c542`, Plata `#c0c5ce`, Bronce `#c8803c`, Estímulo `#7fb3d5`).

## Anti-patterns (do NOT)
- No raw hex in components — use the CSS vars.
- No low-contrast "selected" states (the original 1px faint border was the bug fixed).
- No drop shadows for elevation; use surface + border steps.
- No icon-less dense option lists where a choice is being made.
