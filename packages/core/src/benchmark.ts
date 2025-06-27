import type { Component, Controller } from "#lib/component";
import type {
  BenchmarkConfig,
  BenchmarkSuiteItem,
  FrameworkConfig,
} from "#lib/config";
import { getGC } from "#lib/gc";
import { readMemoryUsage } from "#lib/memory";
import {
  benchResultsToStats,
  getProcessedGroupRecords,
  type BenchmarkRecord,
  type ProcessedRecord,
} from "#lib/stats";
import { runWorker } from "#lib/worker-utils";
import { join } from "node:path";

export interface BenchmarkResult {
  setupTime: number;
  taskTime: number;
  cleanupTime: number;
  gcTime: number;
  memoryUsage: number;
  cleanMemoryUsage: number;
}

export interface BenchmarkRunResponse {
  warmupResults: BenchmarkResult[];
  results: BenchmarkResult[];
  failureReason: undefined | Error;
}

export interface BenchmarkRunConfig<
  TComponent extends Component<any>,
  TParams,
  TRunController extends Controller
> {
  setup: (Component: TComponent, params: TParams) => TRunController;
  run: (input: TRunController, params: TParams) => undefined;
}

export interface BenchmarkRunOptions {
  iterations?: number;
  time?: number;
  gcMemoryLimit?: number;
  warmupIterations?: number;
  warmupTime?: number;
  warmupGCMemoryLimit?: number;
  shouldGC?: boolean;
}

export function createBenchmark<
  TComponent extends Component<any>,
  TParams,
  TRunController extends Controller
>(
  config: BenchmarkRunConfig<TComponent, TParams, TRunController>
): BenchmarkRunConfig<TComponent, TParams, TRunController> {
  return config;
}

export async function runBenchmark<
  TComponent extends Component<any>,
  TParams,
  TRunController extends Controller
>(
  runConfig: BenchmarkRunConfig<TComponent, TParams, TRunController>,
  component: TComponent,
  params: TParams,
  {
    iterations = 100,
    time = 500,
    gcMemoryLimit = 10_000,
    warmupIterations = 500,
    warmupTime = 500,
    warmupGCMemoryLimit = 500_000,
    shouldGC = false,
  }: BenchmarkRunOptions = {}
): Promise<BenchmarkRunResponse> {
  const { setup, run } = runConfig;
  const garbageCollect = shouldGC ? getGC() : undefined;
  let isInWarmup = warmupIterations > 0 || warmupTime > 0;
  let warmupResults: BenchmarkResult[] | undefined;
  let results: BenchmarkResult[] = [];
  let failureReason: undefined | Error;
  let iEnd = isInWarmup ? warmupIterations : iterations;
  let tEnd = performance.now() + (isInWarmup ? warmupTime : time);
  let i = 0;
  let t = 0;
  while (i < iEnd || t < tEnd) {
    // console.log(i, iEnd, t, tEnd);
    const setupStart = performance.now();
    let controller: TRunController | undefined = setup(component, params);
    const setupTime = performance.now() - setupStart;
    let taskTime = 0;

    try {
      const taskStart = performance.now();
      run(controller, params);
      t = performance.now();
      taskTime = t - taskStart;
      i++;
    } catch (cause) {
      failureReason = new Error("Task failure", { cause });
      break;
    }
    const memoryUsage = readMemoryUsage();
    let cleanupTime = 0;
    if (controller.cleanup) {
      const cleanupStart = performance.now();
      controller.cleanup?.();
      cleanupTime = performance.now() - cleanupStart;
    }
    controller = undefined;
    let gcTime = NaN;
    if (
      garbageCollect &&
      memoryUsage > (isInWarmup ? warmupGCMemoryLimit : gcMemoryLimit)
    ) {
      const gcStart = performance.now();
      await garbageCollect();
      gcTime = performance.now() - gcStart;
    }

    const cleanMemoryUsage = readMemoryUsage();
    results.push({
      setupTime,
      taskTime,
      cleanupTime,
      gcTime,
      memoryUsage,
      cleanMemoryUsage,
    });

    if (isInWarmup && !(i < iEnd || t < tEnd)) {
      await garbageCollect?.();
      isInWarmup = false;
      t = 0;
      i = 0;
      iEnd = iterations;
      tEnd = performance.now() + time;
      warmupResults = results;
      results = [];
    }
  }
  return {
    results,
    warmupResults: warmupResults ?? [],
    failureReason,
  };
}

function makeTableFromRecords(
  resultKeys: Set<string>,
  processedRecords: (readonly [string, Map<string, ProcessedRecord>])[],
  recordKey: "means" | "normalizedMeans",
  subKey: keyof BenchmarkRecord<any>,
  fractionDigits = 0,
  missingSymbol = "-"
) {
  const table = [];
  table.push(["benchmark name", ...resultKeys]);
  for (const [benchName, records] of processedRecords) {
    const row = [benchName];
    table.push(row);
    for (const key of resultKeys) {
      const record = records.get(key);
      if (record) {
        const v = record[recordKey][subKey];
        row.push(v.toFixed(fractionDigits));
      } else {
        row.push(missingSymbol);
      }
    }
  }
  return table;
}

function makeCountTableFromRecords(
  resultKeys: Set<string>,
  processedRecords: (readonly [string, Map<string, ProcessedRecord>])[],
  missingSymbol = "-"
) {
  const table = [];
  table.push(["benchmark name", ...resultKeys]);
  for (const [benchName, records] of processedRecords) {
    const row = [benchName];
    table.push(row);
    for (const key of resultKeys) {
      const record = records.get(key);
      if (record) {
        row.push(record.values.task.length.toFixed(0));
      } else {
        row.push(missingSymbol);
      }
    }
  }
  return table;
}

function makeWarmupCountTable(
  resultKeys: Set<string>,
  input: Map<string, Map<string, number>>,
  missingSymbol = "-"
) {
  const table = [];
  table.push(["benchmark name", ...resultKeys]);
  for (const [benchName, records] of input) {
    const row = [benchName];
    table.push(row);
    for (const key of resultKeys) {
      const record = records.get(key);
      if (record) {
        row.push(record.toFixed(0));
      } else {
        row.push(missingSymbol);
      }
    }
  }
  return table;
}

function printCsv(data: string[][], separator = ", ") {
  for (const row of data) {
    console.log(row.join(separator));
  }
}

async function runMain(
  item: BenchmarkSuiteItem
): Promise<BenchmarkRunResponse | undefined> {
  const { componentConfig, benchmarkConfig } = item;

  const componentModule = await import(componentConfig.path).catch(() => ({}));
  const component: Component<unknown> | undefined =
    componentModule[componentConfig.key];

  if (component === undefined) {
    return undefined;
  }

  const benchmarkModule = await import(benchmarkConfig.path);
  const benchmark = benchmarkModule[benchmarkConfig.key];
  try {
    return await runBenchmark(
      benchmark,
      component,
      benchmarkConfig.params,
      benchmarkConfig.runOptions
    );
  } catch (cause) {
    return {
      results: [],
      warmupResults: [],
      failureReason: new Error("Bench failure", { cause }),
    };
  }
}

export interface RunBenchmarkSuiteOptions {
  benchmarkFilter?: (name: string) => boolean;
  frameworkFilter?: (name: string) => boolean;
  verbose?: boolean;
  runInWorker?: boolean;
  shouldGC?: boolean;
}

export async function runBenchmarkSuite(
  frameworks: FrameworkConfig[],
  benchmarkConfigs: BenchmarkConfig[],
  {
    verbose,
    frameworkFilter,
    benchmarkFilter,
    runInWorker = true,
    shouldGC = false,
  }: RunBenchmarkSuiteOptions = {}
) {
  const runner = runInWorker ? runWorker : runMain;
  const resultKeys = new Set<string>();
  const benchmarksGroup = new Map<string, Map<string, BenchmarkResult[]>>();
  const benchmarksWarmupCountGroup = new Map<string, Map<string, number>>();

  for (const benchmarkConfig of benchmarkConfigs) {
    const benchName = benchmarkConfig.name;
    if (benchmarkFilter ? !benchmarkFilter(benchName) : false) {
      continue;
    }
    const benchmarkBasename = benchmarkConfig.componentPath;
    const resultsGroup = new Map<string, BenchmarkResult[]>();
    const warmupCounts = new Map<string, number>();
    benchmarksGroup.set(benchName, resultsGroup);
    benchmarksWarmupCountGroup.set(benchName, warmupCounts);

    if (verbose) {
      console.log(`Benchmark: ${benchName}`);
    }

    for (const fConfig of frameworks) {
      if (frameworkFilter ? !frameworkFilter(fConfig.name) : false) {
        continue;
      }
      if (fConfig.disabledBenchmarks?.includes(benchmarkBasename)) {
        if (verbose) {
          console.log(`${fConfig.name}: Disabled`);
        }
        continue;
      }
      const frameworkPath = fConfig.path;
      const response = await runner({
        componentConfig: {
          path: join(frameworkPath, benchmarkBasename),
          key: fConfig.componentKey ?? "component",
        },
        benchmarkConfig: {
          ...benchmarkConfig,
          runOptions: {
            shouldGC,
            ...benchmarkConfig.runOptions,
          },
        },
      });
      if (!(response === undefined || response.failureReason)) {
        resultKeys.add(fConfig.name);
        resultsGroup.set(fConfig.name, response.results);
        warmupCounts.set(fConfig.name, response.warmupResults.length);
      }
      if (verbose) {
        if (response) {
          if (response.failureReason) {
            console.error(
              `${fConfig.name}: Implementation failed`,
              response.failureReason
            );
          } else {
            console.log(`${fConfig.name}:`);
            console.table(benchResultsToStats(response.results));
          }
        } else {
          console.log(`${fConfig.name}: Implementation missing`);
        }
      }
    }
  }

  const processedRecords = [...benchmarksGroup].map(
    ([name, group]) => [name, getProcessedGroupRecords(group)] as const
  );

  console.log("\nWarmup Count:");
  printCsv(makeWarmupCountTable(resultKeys, benchmarksWarmupCountGroup));

  console.log("\nSample Count:");
  printCsv(makeCountTableFromRecords(resultKeys, processedRecords));

  console.log("\nMean setup time in micro seconds:");
  printCsv(
    makeTableFromRecords(resultKeys, processedRecords, "means", "setup", 3)
  );

  console.log("\nMean cleanup time in micro seconds:");
  printCsv(
    makeTableFromRecords(resultKeys, processedRecords, "means", "cleanup", 3)
  );

  if (shouldGC) {
    console.log("\nMean GC time in micro seconds:");
    printCsv(
      makeTableFromRecords(resultKeys, processedRecords, "means", "gc", 3)
    );
  }

  console.log("\nMean memory in kb:");
  printCsv(
    makeTableFromRecords(resultKeys, processedRecords, "means", "memory")
  );

  console.log("\nMean task time in micro seconds:");
  printCsv(
    makeTableFromRecords(resultKeys, processedRecords, "means", "task", 3)
  );

  console.log("\nNormalized mean task time:");
  printCsv(
    makeTableFromRecords(
      resultKeys,
      processedRecords,
      "normalizedMeans",
      "task",
      1
    )
  );
}
