import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nextConfigSource = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

test("public web proxy raises multipart upload body limit", () => {
  assert.match(nextConfigSource, /const API_PROXY_BODY_LIMIT = "50mb";/);
  assert.match(nextConfigSource, /proxyClientMaxBodySize:\s*API_PROXY_BODY_LIMIT/);
});
