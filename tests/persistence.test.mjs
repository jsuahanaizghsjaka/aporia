import test from "node:test";
import assert from "node:assert/strict";
import {
  commitPreview,
  createRequestOrder,
  PreviewConflict,
} from "../src/lib/preview-storage.ts";
import {
  saveProfileRecord,
  validatePreparedAvatar,
} from "../src/lib/profile/save.ts";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
test("stale preview answers are refused before a request or after a concurrent save", async () => {
  let value = "question-1";
  const storage = {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
  };
  const response = deferred();
  const first = commitPreview(
    storage,
    "learning",
    value,
    () => response.promise,
  );
  value = "question-2";
  response.resolve({ value: "stale-answer", result: true });
  await assert.rejects(first, PreviewConflict);
  assert.equal(value, "question-2");
  await assert.rejects(
    () =>
      commitPreview(storage, "learning", "question-1", () => {
        assert.fail("a stale answer must not be sent");
      }),
    PreviewConflict,
  );
});
test("quota and network failures preserve saved state and never report success", async () => {
  const storage = {
    getItem: () => "old",
    setItem: () => {
      throw new Error("QuotaExceeded");
    },
  };
  await assert.rejects(
    () =>
      commitPreview(storage, "learning", "old", async () => ({
        value: "new",
        result: true,
      })),
    /не сохранил/,
  );
  await assert.rejects(
    () =>
      commitPreview(storage, "learning", "old", async () => {
        throw new Error("offline");
      }),
    /offline/,
  );
});
test("a slow load cannot replace a completed mutation or a more recent refresh", async () => {
  const order = createRequestOrder();
  const slow = deferred();
  let displayed = "old";
  const ticket = order.next();
  const load = slow.promise.then((value) => {
    if (order.isCurrent(ticket)) displayed = value;
  });
  order.next();
  displayed = "accepted answer";
  slow.resolve("stale snapshot");
  await load;
  assert.equal(displayed, "accepted answer");
  assert.equal(order.isCurrent(order.next()), true);
});

function webp() {
  const bytes = new Uint8Array(24);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, 16, true);
  bytes.set(new TextEncoder().encode("WEBPVP8 "), 8);
  return bytes;
}
function fixture({
  version = 1,
  rpcError = false,
  rpcVersion = 2,
  signError = false,
  cleanupError = false,
} = {}) {
  const removed = [],
    uploaded = [];
  let commits = 0;
  const bucket = {
    upload: async (path) => {
      uploaded.push(path);
      return { error: null };
    },
    createSignedUrl: async () => ({
      data: { signedUrl: "https://example.invalid/signed" },
      error: signError,
    }),
    remove: async (paths) => {
      removed.push(...paths);
      if (cleanupError) throw new Error("offline");
      return { error: null };
    },
  };
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { avatar_path: "owner/old.webp", version },
            error: null,
          }),
        }),
      }),
    }),
    storage: { from: () => bucket },
    rpc: async () => {
      commits++;
      return { data: rpcVersion, error: rpcError };
    },
  };
  return { client, removed, uploaded, commits: () => commits };
}
const photo = () => ({ bytes: webp(), type: "image/webp" });
test("stale profile versions never upload or overwrite a photo", async () => {
  const f = fixture({ version: 2 });
  await assert.rejects(
    () => saveProfileRecord(f.client, "owner", {}, 1, photo()),
    { status: 409 },
  );
  assert.equal(f.uploaded.length, 0);
  assert.equal(f.commits(), 0);
});
test("failed signing and rejected concurrent profile writes clean up only the new upload", async () => {
  for (const settings of [{ signError: true }, { rpcVersion: -1 }]) {
    const f = fixture(settings);
    await assert.rejects(() =>
      saveProfileRecord(f.client, "owner", {}, 1, photo()),
    );
    assert.deepEqual(f.removed, f.uploaded);
    assert.ok(!f.removed.includes("owner/old.webp"));
  }
});
test("an ambiguous commit timeout never deletes a possibly committed photo", async () => {
  const f = fixture({ rpcError: true });
  await assert.rejects(
    () => saveProfileRecord(f.client, "owner", {}, 1, photo()),
    { status: 503 },
  );
  assert.equal(f.commits(), 1);
  assert.equal(f.removed.length, 0);
});
test("committed avatar remains successful when removing the old object fails", async () => {
  const f = fixture({ cleanupError: true });
  const result = await saveProfileRecord(f.client, "owner", {}, 1, photo());
  assert.equal(result.version, 2);
  assert.equal(result.avatarPath, f.uploaded[0]);
  assert.deepEqual(f.removed, ["owner/old.webp"]);
});
test("prepared upload checks reject truncated, oversized and mislabeled WebP containers", () => {
  assert.doesNotThrow(() => validatePreparedAvatar(webp(), "image/webp"));
  for (const [bytes, type] of [
    [webp().slice(0, 18), "image/webp"],
    [webp(), "image/svg+xml"],
    [new Uint8Array(1024 * 1024 + 1), "image/webp"],
  ])
    assert.throws(() => validatePreparedAvatar(bytes, type));
  const broken = webp();
  broken[4] = 1;
  assert.throws(() => validatePreparedAvatar(broken, "image/webp"));
});
