/**
 * Read a bounded batch with a stable keyset cursor. Unresolved items do not
 * prevent later items from being visited; wrap only after reaching the end.
 * Cursor state is process-local, so restarts safely retry existing records.
 */
export function createRotatingBatchReader<T extends { id: string }>(
  fetchAfter: (afterId: string | null, limit: number) => Promise<T[]>,
  batchSize: number,
): () => Promise<T[]> {
  let afterId: string | null = null;
  return async () => {
    let batch = await fetchAfter(afterId, batchSize);
    if (batch.length === 0 && afterId !== null) {
      afterId = null;
      batch = await fetchAfter(null, batchSize);
    }
    if (batch.length > 0) afterId = batch[batch.length - 1].id;
    return batch;
  };
}