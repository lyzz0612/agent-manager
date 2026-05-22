import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { AGENT_KINDS, PROTOCOL_VERSION } from "../src/index.ts";

describe("shared protocol constants", () => {
  it("exposes v1 agent kinds", () => {
    assert.equal(PROTOCOL_VERSION, 1);
    assert.deepEqual([...AGENT_KINDS], ["cursor", "codex", "claude-code"]);
  });
});
