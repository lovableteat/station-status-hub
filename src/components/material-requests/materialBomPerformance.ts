export interface BomRecordFetchRange {
  from: number;
  to: number;
}

interface BomPayloadReferenceCandidate {
  generatedAt: string;
  recordCount: number;
  records: readonly unknown[];
  sheetName: string;
  sourceFile: string;
}

export function canReuseBomPayloadReference(
  current: BomPayloadReferenceCandidate,
  incoming: BomPayloadReferenceCandidate,
) {
  return current.records === incoming.records
    && current.recordCount === incoming.recordCount
    && current.sourceFile === incoming.sourceFile
    && current.sheetName === incoming.sheetName
    && current.generatedAt === incoming.generatedAt;
}

export function createBomRecordFetchRanges(
  recordCount: number,
  batchSize = 1000,
): BomRecordFetchRange[] {
  const safeCount = Number.isFinite(recordCount) ? Math.max(0, Math.trunc(recordCount)) : 0;
  const safeBatchSize = Number.isFinite(batchSize) ? Math.max(1, Math.trunc(batchSize)) : 1000;

  return Array.from(
    { length: Math.ceil(safeCount / safeBatchSize) },
    (_, index) => ({
      from: index * safeBatchSize,
      to: ((index + 1) * safeBatchSize) - 1,
    }),
  );
}

export function chunkBomRecordFetchRanges(
  ranges: BomRecordFetchRange[],
  concurrency = 4,
) {
  const safeConcurrency = Number.isFinite(concurrency)
    ? Math.max(1, Math.trunc(concurrency))
    : 4;
  const waves: BomRecordFetchRange[][] = [];

  for (let index = 0; index < ranges.length; index += safeConcurrency) {
    waves.push(ranges.slice(index, index + safeConcurrency));
  }
  return waves;
}
