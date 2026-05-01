# Gallery Thumbnails Design

## Goal

Reduce gallery image stream bandwidth by serving compressed thumbnails in the masonry list while preserving original images for preview and download.

## Decisions

- Keep the existing original asset endpoint: `/api/public/image/assets/{asset_id}`.
- Add a thumbnail endpoint: `/api/public/image/assets/{asset_id}/thumbnail`.
- Return `thumbnail_url` from gallery payloads; keep `asset_url` as the original.
- Frontend gallery tiles use `thumbnail_url` for `<img src>`.
- Preview and download actions continue to use `asset_url`.
- Thumbnails preserve aspect ratio. They must not crop, stretch, pad, or distort images.
- Thumbnail generation errors surface as explicit HTTP errors. No silent original-image fallback.

## Non-Goals

- No database migration for thumbnail paths in this iteration.
- No CDN integration.
- No background backfill worker.
- No change to generation result pages or prompt app result pages.

## Data Flow

1. Gallery page calls `/api/public/image/gallery`.
2. API returns both `asset_url` and `thumbnail_url`.
3. Masonry list loads `thumbnail_url`.
4. Click preview opens `asset_url`.
5. Download link uses `asset_url`.

## Thumbnail Policy

- Maximum rendered dimension: 640 pixels.
- JPEG/WebP compression is acceptable for thumbnail responses.
- For SVG assets, return the SVG bytes from the thumbnail endpoint because rasterizing SVG would require a separate renderer not currently present.
