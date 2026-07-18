export function filterAuthorizedConflictRows<
  T extends { leftFileId: string; rightFileId: string },
>(rows: T[], fileIds: string[]) {
  const allowed = new Set(fileIds);
  return rows.filter(
    (row) => allowed.has(row.leftFileId) && allowed.has(row.rightFileId),
  );
}
