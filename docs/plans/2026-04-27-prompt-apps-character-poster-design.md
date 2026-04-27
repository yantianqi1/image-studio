# Prompt Apps Character Poster Design

## Context

The public web app currently has fixed top navigation entries for image generation, comic, tasks, wallet, and login. Image generation already supports model selection, anonymous usage when enabled, client-provider usage, member usage, job creation, polling, and result display through the public image job API.

This design adds a new public navigation module named "应用" for built-in prompt mini apps. The first mini app is "角色海报", which wraps a fixed character-poster prompt template behind a small form.

## Goals

- Add a top-level "应用" entry.
- Add an app center page listing built-in mini apps.
- Add a "角色海报" mini app page.
- Let users enter only a role name and optional note.
- Keep model selection visible.
- Hide the full prompt template completely.
- Show generation progress and result images on the same page.
- Support both anonymous users and logged-in users through the existing image job API.

## Non-Goals

- No database tables for prompt apps.
- No admin UI for editing prompt apps.
- No backend API changes.
- No prompt-template preview or expand/collapse UI.
- No silent fallback when anonymous generation is disabled or model creation fails.

## Routes

- `/apps`: app center. Shows built-in mini app cards. Initial card: "角色海报".
- `/apps/character-poster`: character poster generator.

The top navigation gains one item:

- label: `应用`
- href: `/apps`

## Character Poster User Flow

1. User opens `/apps`.
2. User clicks "角色海报".
3. User enters:
   - character name, required
   - note, optional
   - image model, required
4. User clicks generate.
5. The page composes the hidden prompt from the fixed template and submitted values.
6. The page calls the existing public image job API.
7. The page polls the existing image job result endpoints.
8. The right-side result panel shows progress, errors, or generated images.

## Access Model

The mini app must be usable by both anonymous and logged-in users.

No frontend login gate should be added. The request should go through `publicApi.generateImage()` exactly like regular image generation:

- Logged-in user: backend uses the user session cookie and member pricing.
- Anonymous user with client provider config: backend uses client provider config and zero platform charge.
- Anonymous user without client provider config: backend allows or rejects according to existing anonymous image settings.

Any backend rejection must be surfaced directly in the page error state. The frontend must not fake success, hide errors, or silently switch behavior.

## Prompt Template

The complete template is code-owned and hidden from users. It takes:

- `character`
- `note`

The first line is generated as:

```text
【角色】= {<character>}（<note>）
```

If `note` is empty, omit the parenthesized note.

The rest of the template is fixed and includes the user-provided poster instructions:

- automatic retrieval of original work, scenes, action, colors, and style
- 16:9 horizontal dual-region composition
- half-body feature area on the left and center
- full-body famous-scene image on the right
- Chinese typography requirements
- 4K poster/wallpaper quality target

## Frontend Structure

Add a new feature folder:

```text
apps/public-web/src/features/prompt-apps/
```

Recommended files:

- `prompt-apps.ts`: app metadata and template composition helpers
- `prompt-apps-home.tsx`: `/apps` app center UI
- `character-poster-app.tsx`: `/apps/character-poster` page UI and state
- `prompt-apps.module.css`: feature-specific layout and visual styling

Add route files:

```text
apps/public-web/src/app/apps/page.tsx
apps/public-web/src/app/apps/character-poster/page.tsx
```

Update:

```text
apps/public-web/src/features/shell/app-shell.tsx
```

## Data Flow

The page should reuse existing public API helpers:

- `publicApi.getModels()`
- `publicApi.generateImage()`
- `publicApi.getImageJob()`
- `publicApi.getImageJobResults()`
- `waitForImageJobResults()`
- `imageJobResultsToHistoryImages()` if useful

The character poster submit request uses:

- `prompt`: hidden composed prompt
- `model_code`: selected image model
- `requested_count`: 1
- `mode`: `generate`

The requested layout is 16:9, so the composed prompt should include the explicit 16:9 horizontal requirement. No separate aspect-ratio backend field exists today.

## UI Design

Use the existing quiet studio language rather than a marketing landing page.

`/apps`:

- app center grid
- each mini app is an actionable card
- first card: "角色海报"
- concise description and status metadata

`/apps/character-poster`:

- workspace-style two-column layout
- left panel: form controls
- right panel: result stage and generated images
- no full prompt display
- no template preview
- explicit error card when model list or generation fails

## Error Handling

- If model loading fails, show the API error and disable submit.
- If no image models are available, show an explicit empty state and disable submit.
- If generation fails, show the backend error message.
- If anonymous generation is rejected by backend settings, show that rejection directly.
- Preserve user-entered character and note after any failure.

## Testing

Recommended verification:

- Typecheck public web package.
- Verify `/apps` renders and navigation active state works.
- Verify `/apps/character-poster` validates required character input.
- Verify model loading state, empty/error state, and ready state.
- Verify successful submit calls `/image/jobs` with a composed prompt and renders result polling state.
- Verify backend errors appear in the page without fallback success.

