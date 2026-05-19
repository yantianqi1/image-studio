import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const controlsSource = readFileSync(
  new URL("../src/features/shell/client-provider-controls.tsx", import.meta.url),
  "utf8",
);

const popoverSource = readFileSync(
  new URL("../src/features/shell/provider-settings-popover.tsx", import.meta.url),
  "utf8",
);

test("client provider controls move raw inputs into settings popover", () => {
  assert.match(controlsSource, /ProviderSettingsPopover/);
  assert.match(popoverSource, /通道设置/);
  assert.match(popoverSource, /OpenAI 兼容 URL/);
  assert.match(popoverSource, /API Key/);
});

test("settings popover closes on outside pointer interaction", () => {
  assert.match(popoverSource, /addEventListener\("pointerdown"/);
  assert.match(popoverSource, /popover\.contains\(target\)/);
  assert.match(popoverSource, /popover\.removeAttribute\("open"\)/);
});
