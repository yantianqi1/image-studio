# Gallery Mobile Performance Design

## Goal

Improve mobile gallery opening and scrolling smoothness without changing the user's visible layout, ordering, controls, or visual treatment.

## Decisions

- Keep backend gallery ordering unchanged: newest assets first.
- Keep the existing measured shortest-column masonry algorithm.
- Keep responsive column counts unchanged: phone 2 columns, small tablet 3 columns, larger screens 4 columns.
- Keep tile overlays, actions, shadows, filters, hover states, and touch behavior visually unchanged.
- Batch image aspect-ratio measurements so multiple image load events trigger one React state update per animation frame.
- Skip aspect-ratio state updates when all measured ratios already match current state.
- Add browser-level offscreen rendering hints with `content-visibility: auto` and `contain-intrinsic-size`.

## Non-Goals

- No virtualized list in this iteration.
- No change to API payloads or database queries.
- No change to thumbnail generation.
- No visual simplification for mobile.

## Data Flow

1. Gallery page receives API items in existing order.
2. Masonry renders the existing columns with the current algorithm.
3. Tile images report natural size on load.
4. The masonry component buffers reported ratios in a ref.
5. A single animation-frame flush merges pending ratios into React state.
6. CSS lets the browser defer rendering offscreen tiles while preserving approximate scroll geometry.
