---
name: screenshot-to-code
description: Replicate an existing UI from a screenshot, mockup, design export or short screen recording as working code, as faithfully as possible. Use when the user supplies an image of an interface and asks to build it, copy it, clone it, port it, "hacelo igual a esto", "convertí esta captura en código", "codeá este diseño", "replicá esta pantalla", or asks to iterate on a UI that was previously built from a screenshot. Fidelity to the source image is the goal — exact text, exact layout, exact colors. NOT for inventing a design from a brief (use a design skill for that), and NOT for generating the reference image first (that is image-to-code).
---

# Screenshot to code

Method ported from `abi/screenshot-to-code` (`backend/prompts/`). The repo has no
skill of its own; this file is the procedure its prompts encode.

The contract is **fidelity**. The user already has the design. Your job is not to
improve it, modernize it, or reinterpret it — it is to make the rendered page look
like the screenshot. Every "tasteful" deviation is a defect here.

---

## 1. Before writing anything, settle three things

**Target.** Two very different destinations:

| Destination | What you produce |
|---|---|
| A throwaway replica / prototype / "quiero ver esto andando" | **one standalone HTML file**, CDN scripts, no build step (see `references/stacks.md`) |
| A screen inside an existing codebase | a component in **that repo's stack and conventions** — read a neighbouring file first |

In this repo (G22 Scores: Next.js App Router + Tailwind) the second is almost always
the right answer. A standalone `index.html` here is only useful as a scratch preview,
and it goes in the scratchpad, never in `src/`.

**Stack.** If the user named one, use it. If not, match the repo. If there is no repo,
ask — or default to HTML + Tailwind and say so in one line.

**Design system.** If the project has tokens, a palette, or a component library, it
**wins over the screenshot** when the two conflict, and it wins over your own taste
always. State the conflict in one sentence and follow the system.

---

## 2. Read the screenshot properly

Do not skim it and start typing. Enumerate, out loud or in your head, before the
first line of code:

- **Every string.** Use the *exact* text from the image. No "Lorem ipsum", no
  paraphrase, no fixed typos, no translated labels.
- **The layout skeleton.** How many columns, where things align, what is fixed vs.
  fluid, what wraps.
- **The type scale.** Sizes, weights, letter-spacing, line-height — read them off
  the image rather than reaching for defaults.
- **The palette.** Sample the actual colors. `slate-800` is not "close enough" to a
  color you can read off the pixels.
- **Spacing.** The rhythm between sections is most of what makes a replica read as
  faithful or as "an AI version of it".
- **State.** Which tab is active, which row is hovered, which field has focus. The
  screenshot is one state of a component — build that state, and note the others.

If the image is low-resolution or an area is ambiguous, say what you could not read
instead of inventing something plausible.

---

## 3. Assets

Order of preference, strictly:

1. **Extract from the screenshot.** Crop the real logo, avatar, illustration or
   product shot out of the source image and use that. Inspect the crop afterwards —
   a crop that grabbed half a neighbouring element is worse than a placeholder.
2. **Use an asset the project already has.** In this repo that means the real crest
   or flag through the existing components, never a re-drawn one.
3. **Generate it**, only if image generation is actually available and the asset is
   genuinely unextractable (occluded, or it is the page background).
4. **Placeholder**: `https://placehold.co/WIDTHxHEIGHT`, sized to the real slot.

Two hard rules from upstream:

- **Never embed the screenshot itself as the page.** Pasting the whole capture as one
  `<img>` is not a replica, it is a picture of one. Assets are for images; layout is
  code.
- **Never CSS-stretch a pixelated asset.** If an extracted asset must render larger
  than it was captured, upscale the asset. Scaling a 40px logo to 200px with `width`
  looks exactly as bad as it sounds.

Transparency: generated images come with a background. Remove it explicitly if the
slot needs transparency.

---

## 4. Multiple screenshots

Organize them by what they mean, not by upload order:

- Different **pages** of a site → distinct pages, linked to each other.
- Different **tabs or views** of one app → one shell with working navigation.
- **Unrelated** → a scaffold that separates them ("Pantalla 1", "Pantalla 2", …) so
  each is reachable.

For mobile captures, drop the device frame and the browser chrome. Build the UI, not
the phone around it.

---

## 5. Verify before you claim it matches

Rendering it in your head does not count. Take a screenshot of the result — desktop
**and** mobile widths — and compare it against the source side by side. The
Playwright MCP server is configured in this session; use it.

Look specifically for what goes wrong in replicas: overlapping elements, a heading
that wrapped where the original did not, spacing that drifted, a color that came out
as the nearest Tailwind token instead of the real value, an icon at the wrong weight.
Fix them and screenshot again.

Report honestly what still differs. "Quedó igual" about a page you never rendered is
the failure mode this section exists to prevent.

---

## 6. Iterating on an existing replica

Once the file exists, **edit it — do not regenerate it.** Full rewrites lose the
corrections already applied and churn everything the user already accepted.

When the user points at one element (or pastes its `outerHTML` from the live DOM),
treat that markup as a *locator*, not as source. The live DOM differs from the
source: JSX writes `className`, Vue templates carry directives and interpolations,
and Bootstrap/Ionic inject classes at runtime. Find the code that *produces* that
element — matching on tag, classes, id and text — and change only that, leaving the
rest of the file alone.

---

## 7. Tone

Concise. Do not paste the generated code back into chat — it is in the file. Close
with one or two sentences on what you built and what still differs from the source.

Answer in the user's language.

---

Stack-specific CDN snippets and per-framework rules: `references/stacks.md`.
