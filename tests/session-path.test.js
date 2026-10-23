import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import test from "node:test";
import { sessionFilePath } from "../lib/store.js";

test("the shared session defaults to the desktop profile", () => {
  const previous = process.env.DAFEIYU_SESSION_FILE;
  delete process.env.DAFEIYU_SESSION_FILE;
  try {
    assert.equal(
      sessionFilePath(),
      path.join(homedir(), ".dsh", "profiles", "desktop", "dafeiyu-xiangqi.json"),
    );
  } finally {
    if (previous === undefined) delete process.env.DAFEIYU_SESSION_FILE;
    else process.env.DAFEIYU_SESSION_FILE = previous;
  }
});

test("the bundle patch resolves its paths from the profile", () => {
  const text = readFileSync(new URL("../cordis.patch.yml", import.meta.url), "utf8");
  assert.doesNotMatch(text, /\/Users\//);
  assert.match(text, /createRequire\(ctx\.baseUrl\)/);
  assert.match(text, /mcp-stdio\.js/);
});
