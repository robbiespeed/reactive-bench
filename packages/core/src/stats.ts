import type { BenchmarkResult } from "#lib/benchmark";

export function calcPercentile(
  sortedValues: readonly number[],
  fraction: number
): number {
  const size = sortedValues.length;
  const index = size * fraction;
  const ceilIndex = Math.ceil(index);
  return index === ceilIndex
    ? (sortedValues[index - 1]! + sortedValues[index]!) / 2
    : sortedValues[ceilIndex - 1]!;
}

export function calcMean(values: readonly number[]) {
  return values.reduce((a, v) => a + v) / values.length;
}

export function calcStandardDeviation(
  values: readonly number[],
  mean: number,
  isPopulation = false
) {
  return Math.sqrt(
    values.reduce((a, v) => a + (v - mean) ** 2, 0) /
      (values.length - (isPopulation ? 0 : 1))
  );
}

export function calcMeanAbsoluteDeviation(
  values: readonly number[],
  mean: number
) {
  return values.reduce((a, v) => a + Math.abs(v - mean), 0) / values.length;
}

export function calcNormalize(value: number, min: number) {
  return value / min;
}

export interface BenchmarkRecord<TValue> {
  setup: TValue;
  task: TValue;
  cleanup: TValue;
  gc: TValue;
  memory: TValue;
}

export type BenchmarkValues = BenchmarkRecord<number[]>;

export function getBenchmarkValues(
  results: BenchmarkResult[]
): BenchmarkValues {
  const setup: number[] = [];
  const cleanup: number[] = [];
  const gc: number[] = [];
  const memory: number[] = [];
  const task: number[] = [];

  for (const result of results) {
    // convert to ms to micro seconds
    setup.push(result.setupTime * 1000);
    cleanup.push(result.cleanupTime * 1000);
    gc.push(result.gcTime * 1000);
    memory.push(result.memoryUsage);
    for (const record of result.taskTimeRecords) {
      task.push(record.task * 1000);
    }
  }

  return {
    cleanup,
    gc,
    memory,
    setup,
    task,
  };
}

export function mapBenchmarkRecord<TIn, TOut>(
  record: BenchmarkRecord<TIn>,
  mapper: (value: TIn, key: keyof BenchmarkRecord<any>) => TOut
): BenchmarkRecord<TOut> {
  return Object.fromEntries(
    (Object.entries(record) as [keyof BenchmarkRecord<any>, TIn][]).map(
      ([k, v]) => [k, mapper(v, k)]
    )
  ) as unknown as BenchmarkRecord<TOut>;
}

export interface ProcessedRecord {
  values: BenchmarkValues;
  means: BenchmarkRecord<number>;
  normalizedMeans: BenchmarkRecord<number>;
}

export function getProcessedGroupRecords(
  benchGroup: Map<string, BenchmarkResult[]>
) {
  const minRecord: BenchmarkRecord<number> = {
    cleanup: Infinity,
    gc: Infinity,
    memory: Infinity,
    setup: Infinity,
    task: Infinity,
  };
  const stepAData = new Map<
    string,
    [BenchmarkValues, BenchmarkRecord<number>]
  >();
  for (const [key, results] of benchGroup) {
    const values = getBenchmarkValues(results);
    const means = mapBenchmarkRecord(values, (v, k) => {
      const mean = calcMean(v);
      if (mean < minRecord[k]) {
        minRecord[k] = mean;
      }
      return calcMean(v);
    });
    stepAData.set(key, [values, means]);
  }
  const result = new Map<string, ProcessedRecord>();
  for (const [key, [values, means]] of stepAData) {
    result.set(key, {
      values,
      means,
      normalizedMeans: mapBenchmarkRecord(means, (v, k) => v / minRecord[k]),
    });
  }
  return result;
}

export interface StatItem {
  size: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  sd: number;
  mad: number;
  firstQuart: number;
  thirdQuart: number;
  percentile90: number;
}

export function createStatItem(values: readonly number[]): StatItem {
  const sorted = [...values];
  sorted.sort((a, b) => a - b);

  const size = sorted.length;
  const mean = calcMean(sorted);

  return {
    size,
    mean,
    median: calcPercentile(sorted, 0.5),
    min: sorted[0]!,
    max: sorted[size - 1]!,
    sd: calcStandardDeviation(sorted, mean),
    mad: calcMeanAbsoluteDeviation(sorted, mean),
    firstQuart: calcPercentile(sorted, 0.25),
    thirdQuart: calcPercentile(sorted, 0.75),
    percentile90: calcPercentile(sorted, 0.9),
  };
}

export type BenchmarkStats = BenchmarkRecord<StatItem>;

export function benchResultsToStats(
  results: BenchmarkResult[]
): BenchmarkStats {
  const values = getBenchmarkValues(results);

  return {
    cleanup: createStatItem(values.cleanup),
    gc: createStatItem(values.gc),
    memory: createStatItem(values.memory),
    setup: createStatItem(values.setup),
    task: createStatItem(values.task),
  };
}
