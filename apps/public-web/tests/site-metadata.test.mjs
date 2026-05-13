import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const siteMetadataSource = readFileSync(
  new URL("../src/lib/site-metadata.ts", import.meta.url),
  "utf8",
);

test("public metadata does not depend on API availability", () => {
  assert.doesNotMatch(siteMetadataSource, /fetch\(/);
  assert.doesNotMatch(siteMetadataSource, /API_BASE_URL/);
  assert.doesNotMatch(siteMetadataSource, /SITE_SETTINGS_PATH/);
});

test("public metadata keeps the stable product title", () => {
  assert.match(siteMetadataSource, /title:\s*"Image Studio"/);
});
