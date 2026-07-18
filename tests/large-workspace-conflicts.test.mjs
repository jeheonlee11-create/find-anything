import assert from "node:assert/strict";
import test from "node:test";
import { filterAuthorizedConflictRows } from "../lib/conflicts/authorization.ts";

test("large workspace conflict filtering avoids D1 parameter-limit queries and fails closed", () => {
  const authorizedFileIds = Array.from({ length: 1_237 }, (_, index) => `file_${index}`);
  const rows = [
    { id: "allowed", leftFileId: "file_10", rightFileId: "file_900" },
    { id: "left-only", leftFileId: "file_10", rightFileId: "unauthorized" },
    { id: "right-only", leftFileId: "unauthorized", rightFileId: "file_900" },
    { id: "neither", leftFileId: "other_a", rightFileId: "other_b" },
  ];

  assert.deepEqual(
    filterAuthorizedConflictRows(rows, authorizedFileIds).map((row) => row.id),
    ["allowed"],
  );
});
