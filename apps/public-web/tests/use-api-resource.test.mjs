import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../src/lib/use-api-resource.ts", import.meta.url),
  "utf8",
);

test("useApiResource does not restart the loader after every render", () => {
  const effectCall = source.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[(.*?)\]\);/);
  assert.ok(effectCall, "Expected useApiResource to declare a useEffect dependency array");

  const dependencies = effectCall[1]
    .split(",")
    .map((dependency) => dependency.trim())
    .filter(Boolean);

  assert.deepEqual(dependencies, ["refreshKey"]);
});
