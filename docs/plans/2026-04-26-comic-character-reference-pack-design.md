# Comic Character Reference Pack Design

## Decision

Use a backend-owned `.zip` character reference pack for comic character reuse.

The public web frontend downloads and uploads the zip file. The API is responsible for building the archive, validating imports, persisting imported images as `Asset` rows, and binding those assets to `ComicCharacterCard.reference_asset_id`.

## Current Context

- `ComicCharacterCard` already stores character metadata, prompts, `reference_image_job_id`, and `reference_asset_id`.
- Generated reference images already become `Asset` rows through image jobs.
- Page image generation already reads `reference_asset_id` from character cards.
- The missing behavior is a portable bundle that carries both the image files and the character setting data.

## Zip Format

Each exported pack contains:

- `characters.json`
- `images/<character-name>.<ext>`

`characters.json` contains:

- `schema_version`
- `exported_at`
- `source_task_id`
- `characters`

Each character entry contains:

- `character_code`
- `name`
- `role_in_story`
- `personality`
- `appearance`
- `costume`
- `color_palette`
- `must_keep_prompt`
- `negative_prompt`
- `multi_view_prompt`
- `image_file`
- `source_asset_id`

Image filenames are derived from the character name. Unsafe filename characters are replaced. Duplicate names use a numeric suffix.

## Backend API

Add:

- `GET /api/public/comic/tasks/{task_id}/character-references/export`
- `POST /api/public/comic/tasks/{task_id}/character-references/import`

Export requires all character references to be ready. If any character has no `reference_asset_id`, return `409 comic_character_references_not_ready`.

Import requires:

- a zip upload
- a valid `characters.json`
- safe archive paths
- one image file for every character entry
- a current task character card matching each entry by `character_code`, falling back to `name`
- an allowed image file type

Import creates new `Asset` rows for uploaded images and updates matching `ComicCharacterCard.reference_asset_id`. It does not create image jobs and does not pretend a generation succeeded.

## Frontend

Add a compact "人设图包" control in the comic project panel:

- export button downloads the zip for the latest task
- import button accepts `.zip`, uploads it, and refreshes task state
- import/export failures surface as visible errors

The UI only enables export when there is a latest task. Backend readiness remains authoritative; frontend does not infer success.

## Error Handling

Failures are explicit:

- missing ready references returns `409`
- malformed zip returns `422`
- missing manifest returns `422`
- missing image returns `422`
- unmatched character returns `409`
- unsafe archive path returns `422`

No fallback image generation path is added.

## Testing

Backend tests cover:

- exported zip contains manifest and renamed character images
- export fails before references are ready
- import binds uploaded images to existing cards
- import rejects malformed or incomplete packs

Frontend tests cover:

- request helper endpoints and zip upload/download helpers
- UI state wiring through focused TypeScript checks
