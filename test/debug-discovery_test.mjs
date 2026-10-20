import assert from "node:assert/strict";
import test from "node:test";
import { codexDebugPorts } from "../src/bridge/codex-cdp.mjs";

const binary = "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT";
const flags = "--remote-debugging-address=127.0.0.1 --remote-debugging-port=9222";

test("discovery only considers the exact Codex application with a loopback CDP listener", () => {
  assert.deepEqual(codexDebugPorts([
    `/Applications/Other.app/Contents/MacOS/Other ${flags}`,
    `/usr/bin/node -e '${binary} ${flags}'`,
    `/Applications/ChatGPT.app/Contents/MacOS/ChatGPTHelper ${flags}`,
    `${binary} ${flags}`,
    `${binary} ${flags}`
  ].join("\n")), [9222]);
});

test("discovery rejects non-loopback addresses, invalid ports and flag lookalikes", () => {
  const lines = [
    `${binary} --remote-debugging-address=0.0.0.0 --remote-debugging-port=9222`,
    `${binary} --remote-debugging-address=127.0.0.1.evil --remote-debugging-port=9222`,
    `${binary} --remote-debugging-address=127.0.0.1 --remote-debugging-port=0`,
    `${binary} --remote-debugging-address=127.0.0.1 --remote-debugging-port=65536`,
    `${binary} --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222x`,
    `${binary} --something=${flags}`
  ];
  for (const line of lines) assert.deepEqual(codexDebugPorts(line), []);
  assert.deepEqual(codexDebugPorts(`  ${binary} --remote-debugging-port 9333 --remote-debugging-address=127.0.0.1`), [9333]);
});
