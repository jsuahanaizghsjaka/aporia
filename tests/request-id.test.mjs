import test from "node:test";
import assert from "node:assert/strict";
import { newRequestId } from "../src/lib/request-id.ts";

test("HTTP preview creates valid unique UUIDs when randomUUID is unavailable", () => {
  const source = { getRandomValues: (bytes) => crypto.getRandomValues(bytes) };
  const ids = Array.from({ length: 100 }, () => newRequestId(source));
  for (const id of ids)
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  assert.equal(new Set(ids).size, 100);
});
