# Gallery Visual Redesign Design

## Goal

Make the public gallery feel like a production image showcase instead of an internal debug panel.

## Reference

The reference project at `/Volumes/Fanxiang S500Pro/项目/chatgpt2api` uses a simple page title, a light toolbar, rounded masonry image cards, and image-first metadata overlays. The current implementation should borrow that hierarchy without copying the admin-only filtering and batch-management surface.

## Design

- Replace the current explanatory hero card with a direct gallery masthead: `图片库`, scope label, and image count.
- Move scope selection and count into a compact toolbar so page title and controls are visually separated.
- Keep the existing `public` and `mine` API scopes; do not change backend behavior.
- Keep the current empty, loading, and error states explicit.
- Present masonry cards as image-first tiles with rounded corners, soft shadows, and a bottom gradient overlay.
- Show visibility, creation time, and prompt in the overlay instead of a white metadata footer.

## Validation

- Update gallery source tests to guard against the old debug-like copy and to require the new masthead, toolbar, and overlay classes.
- Run `pnpm --filter public-web test`, `typecheck`, and `eslint`.
