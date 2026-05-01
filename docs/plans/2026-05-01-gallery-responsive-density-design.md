# Gallery Responsive Density Design

## Goal

Improve image gallery density on phone and tablet screens so the page behaves like an image bed: many thumbnails remain visible at once, while desktop presentation stays unchanged.

## Approved Approach

Use fixed responsive masonry breakpoints:

- Desktop `>=1180px`: keep existing 4 columns.
- Tablet `820px-1179px`: use 4 columns.
- Large phone / small tablet `540px-819px`: use 3 columns.
- Phone `<540px`: use 2 columns.

The masonry algorithm remains unchanged. Only the breakpoint column counts, thumbnail `sizes`, and sub-1180px spacing/control density change.

## UI Behavior

Cards keep preview, copy, reuse, download, visibility, and timestamp affordances. On touch devices the actions stay visible, but their spacing and font sizes become compact enough for 2-4 narrow columns.

## Testing

Add source-level regression tests for the breakpoint map, thumbnail `sizes`, and mobile CSS grid fallback. Run the gallery test file, public-web test suite, and public-web typecheck before completion.
