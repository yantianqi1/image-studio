# Image Gallery Design

## Goal

Build an image gallery channel where generated images are saved to the user's private library by default, can be marked public at generation time or after completion, and are shown in a polished masonry gallery.

## Reference

The reference project `chatgpt2api` has a mature `image-manager` module:

- `web/src/app/image-manager/page.tsx` provides personal/public gallery switching, filters, masonry layout, selection, visibility actions, auto-refresh, and infinite reveal.
- `web/src/components/image-lightbox.tsx` provides full-screen preview, navigation, zoom, pan, and download.
- `internal/service/image.go` stores image ownership and visibility metadata, lists images by scope, and serves on-demand thumbnails.

Current `commercial-studio` should reuse the product ideas, not the implementation shape. The reference page is a large single file and uses filesystem scanning; this project already has database-backed `assets`, `image_jobs`, and `image_job_results`.

## Scope

First version:

- Add asset-level visibility: `private` or `public`.
- Let image generation requests include the desired visibility.
- Persist generated result assets into the user's private library by default.
- Allow generated result assets to be toggled public/private after completion.
- Add a public web gallery page with `mine` and `public` scopes.
- Render gallery images in a responsive masonry layout.
- Reuse a full-screen preview dialog for gallery image inspection.

Out of scope for the first version:

- Bulk delete.
- Bulk download.
- Thumbnail generation pipeline.
- Moderation workflow for public images.
- Cross-user admin gallery management.

## Architecture

Visibility belongs to `assets`, because the generated file is the shareable object. `image_jobs` remains the execution record; `image_job_results` remains the link from a job to the generated assets.

The API exposes gallery items by joining `ImageJobResult`, `ImageJob`, and `Asset`. The `mine` scope returns assets owned by the current user or anonymous session. The `public` scope returns assets whose `visibility` is `public`, regardless of owner, while still exposing only safe display metadata.

Generated assets inherit the requested job visibility when the worker writes `ImageJobResult`. Uploaded reference assets stay private unless a later feature explicitly adds upload publishing.

## Data Model

Add fields to `assets`:

- `visibility`: string, default `private`, indexed.
- `published_at`: nullable datetime.

Allowed values:

- `private`
- `public`

Changing from private to public sets `published_at` to current UTC time. Changing from public to private clears `published_at`.

## API Design

Extend `POST /api/public/image/jobs` request:

```json
{
  "prompt": "string",
  "model_code": "gpt-image-2",
  "requested_count": 1,
  "mode": "generate",
  "visibility": "private"
}
```

Add `GET /api/public/image/gallery?scope=mine|public`.

Response:

```json
[
  {
    "asset_id": 12,
    "asset_url": "/api/public/image/assets/12",
    "visibility": "private",
    "published_at": null,
    "created_at": "2026-05-01T00:00:00",
    "job_id": 8,
    "result_index": 1,
    "prompt": "生成一张生活方式照片",
    "revised_prompt": "..."
  }
]
```

Add `PATCH /api/public/image/assets/{asset_id}/visibility`.

Request:

```json
{ "visibility": "public" }
```

Response returns the updated gallery item or asset payload.

Update `GET /api/public/image/assets/{asset_id}` access rules:

- Owner can read private and public assets.
- Anyone can read public assets.
- Non-owner cannot read private assets.

## Frontend Design

Add nav item:

- Label: `图库`
- Route: `/gallery`

Generation workbench:

- Add a compact segmented choice near submit: `私有保存` / `公开展示`.
- Default to `私有保存`.
- Send `visibility` with `publicApi.generateImage`.
- Result cards show the current visibility and a toggle action after an asset id exists.

Gallery page:

- `AppShell activeHref="/gallery" title="图库"`.
- Top toolbar with `我的图片` / `公开图库` segmented control.
- Responsive masonry columns: 1 column mobile, 2 tablet, 3 desktop, 4 wide.
- Each image tile shows the image, status pill, prompt snippet, and generated time.
- Click image to open full-screen preview.
- Empty, loading, and error states are explicit.

The masonry layout should use fixed column distribution by index for stable rendering, not CSS columns that reorder focus traversal unpredictably.

## Error Handling

No silent fallback:

- Invalid visibility returns explicit validation error.
- Unauthorized private asset access returns `asset_not_found` to avoid leaking private asset existence.
- Gallery load errors render `ErrorMessage`.
- Visibility update failures remain visible in the UI and do not mutate local state as if successful.

## Testing

Backend:

- Asset visibility validation.
- New image job stores requested visibility.
- Generated result asset inherits job visibility.
- Owner can list private gallery assets.
- Public scope lists only public assets.
- Non-owner cannot fetch private asset files.
- Non-owner can fetch public asset files.
- Visibility toggle enforces ownership.

Frontend:

- `publicApi` sends `visibility` for image jobs.
- Navigation exposes `图库`.
- Gallery page route exists and uses `publicApi.getImageGallery`.
- Gallery masonry source contains stable column distribution.
- Generation result panel exposes visibility toggle for asset-backed images.

Verification:

- `python -m pytest tests ...` with a timeout under 60 seconds for backend tests.
- `pnpm --filter public-web test`
- `pnpm --filter public-web typecheck`
