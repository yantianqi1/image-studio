import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("apps/public-web/src/features/comic/comic-studio.tsx", "utf8");
const panelSource = readFileSync("apps/public-web/src/features/comic/manga-project-panel.tsx", "utf8");
const utilsSource = readFileSync("apps/public-web/src/features/comic/comic-utils.ts", "utf8");
const referenceModesSource = readFileSync("apps/public-web/src/features/comic/character-reference-modes.ts", "utf8");
const projectStylesSource = readFileSync("apps/public-web/src/features/comic/comic-project.module.css", "utf8");
const referenceModeStylesSource = readFileSync("apps/public-web/src/features/comic/comic-reference-mode.module.css", "utf8");

test("comic task payload does not send string auto target_image_count", () => {
  assert.doesNotMatch(source, /target_image_count\s*:\s*["']auto["']/);
});

test("comic story input does not cap long source text in the browser", () => {
  assert.doesNotMatch(panelSource, /maxLength=\{?PREMISE_LIMIT\}?/);
  assert.doesNotMatch(utilsSource, /MAX_PREMISE_LENGTH\s*=\s*300/);
});

test("comic workflow does not depend on frontend approval calls after task creation", () => {
  assert.doesNotMatch(source, /approveComicCharacterReferences/);
  assert.doesNotMatch(source, /approveComicTaskImageGeneration/);
});

test("comic task payload includes selected character reference mode", () => {
  assert.match(source, /characterReferenceMode/);
  assert.match(source, /buildTaskInputPayload\(premise, stylePresetId, characterReferenceMode\)/);
  assert.match(panelSource, /ReferenceModeSelect/);
});

test("comic studio defaults character reference mode to single sheet", () => {
  assert.match(
    referenceModesSource,
    /DEFAULT_CHARACTER_REFERENCE_MODE: CharacterReferenceMode = CHARACTER_REFERENCE_MODES\.singleSheet;/,
  );
});

test("character reference mode selector uses the same framed input style family", () => {
  assert.match(panelSource, /referenceModeGrid/);
  assert.match(panelSource, /referenceModeOption/);
  assert.match(referenceModeStylesSource, /\.referenceModeGrid/);
  assert.match(referenceModeStylesSource, /\.referenceModeOption/);
  assert.doesNotMatch(projectStylesSource, /\.chipRow/);
});
