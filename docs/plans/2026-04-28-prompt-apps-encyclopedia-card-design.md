# Prompt Apps Encyclopedia Card Design

## Context

The public web app already has an "应用" center for built-in prompt mini apps. "角色海报" proves the pattern: code-owned hidden prompt template, small user form, visible image-model selection, existing public image job API, polling, and in-page results.

This design adds a second mini app named "科普百科图". It turns a user-entered topic such as "狸花猫" into a vertical modular science/encyclopedia infographic prompt.

## Goals

- Add "科普百科图" to `/apps`.
- Add `/apps/encyclopedia-card`.
- Let users enter a topic word and optional note.
- Hide the complete prompt template from the UI.
- Keep model selection and result display consistent with existing prompt apps.
- Submit through the existing public image job API with `mode: "generate"`.

## Non-Goals

- No backend API change.
- No uploaded reference image requirement.
- No admin prompt editor.
- No prompt preview UI.
- No fake success path when model loading or generation fails.

## User Flow

1. User opens `/apps`.
2. User clicks "科普百科图".
3. User enters a required topic, for example "狸花猫".
4. User optionally adds notes for emphasis or target audience.
5. User selects an image model.
6. User submits.
7. The page builds a hidden prompt and calls `publicApi.generateImage()`.
8. The page polls and displays generated images or explicit errors.

## Prompt Template

The prompt starts with:

```text
【主题】= {<topic>}（<note>）
```

If note is empty, omit the parenthesized note.

The fixed template requests a high-quality vertical "科普百科图" with:

- clear subject hero visual
- local feature zoom details
- rounded modular information blocks
- title hierarchy and emphasis tags
- concise but rich encyclopedia content
- visual scoring, summary, or Top 5 module
- adaptive sections such as basic profile, classification, appearance, habits/ecology, care, risks, suitable audience, pros/cons, quick scoring card
- clean light background, soft palette, subtle shadows, small icons, dense but readable layout

## UI Design

Reuse `prompt-apps.module.css` and the same two-column workspace language:

- left panel: app status, title, copy, topic input, note textarea, model select, submit button
- right panel: existing `PosterResultPanel`
- top-left header back link to `/apps`

The UI should feel like the existing "角色海报" app, not a marketing page.

## Testing

- Catalog exposes both prompt apps.
- `buildEncyclopediaCardPrompt()` trims topic and note.
- Image request uses `requested_count: 1` and `mode: "generate"`.
- Submit is disabled without topic or image model.
- New page source includes the app center back link.
- Run public web tests and typecheck.
