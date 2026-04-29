# 诗词双境图 Prompt App Plan

1. Add tests for catalog metadata, prompt builder, state helper, and route source.
2. Verify the new tests fail because the app does not exist yet.
3. Add `song-poem-scene-prompt.ts` with typed input and hidden long template.
4. Add `song-poem-scene-app-state.ts` for submit validation and request construction.
5. Add the thin React app wrapper and route page using the shared generate-only scaffold.
6. Register the app in `PROMPT_APPS` and export the prompt builder from `prompt-apps.ts`.
7. Add a stable app cover asset.
8. Re-run narrow tests, then public-web test/typecheck/lint and fixed-port smoke checks.
