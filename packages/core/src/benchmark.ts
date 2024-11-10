import type { Component, Controller } from "#lib/component";
import type { BenchmarkConfig, FrameworkConfig } from "#lib/config";
import { garbageCollect } from "#lib/gc";
import { readMemoryUsage } from "#lib/memory";
import {
  benchResultsToStats,
  getProcessedGroupRecords,
  type BenchmarkRecord,
  type ProcessedRecord,
} from "#lib/stats";
import { runWorker } from "#lib/worker-utils";
import { basename, join } from "node:path";

interface TaskTimeRecord {
  preTask: number;
  task: number;
}

export interface BenchmarkResult {
  setupTime: number;
  taskTimeRecords: TaskTimeRecord[];
  cleanupTime: number;
  gcTime: number;
  memoryUsage: number;
  cleanMemoryUsage: number;
}

export interface BenchmarkRunResponse {
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
  preRun?: (input: TRunController, params: TParams) => undefined;
}

export interface BenchmarkRunOptions {
  fullCount?: number;
  taskCount?: number;
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
  { fullCount = 5, taskCount = 100 }: BenchmarkRunOptions = {}
): Promise<BenchmarkRunResponse> {
  if (fullCount < 1) {
    throw new Error("fullCount must be 1 or greater");
  }
  if (taskCount < 0) {
    throw new Error("taskCount must be 0 or greater");
  }
  const { setup, run, preRun } = runConfig;
  const hasPreRun = preRun !== undefined;
  const results: BenchmarkResult[] = [];
  let failureReason: undefined | Error;
  for (let i = 0; i < fullCount; i++) {
    const setupStart = performance.now();
    const controller = setup(component, params);
    const setupTime = performance.now() - setupStart;
    const taskTimeRecords: TaskTimeRecord[] = [];

    for (let j = 0; j < taskCount; j++) {
      const timeRecord: TaskTimeRecord = {
        preTask: 0,
        task: 0,
      };
      taskTimeRecords.push(timeRecord);
      try {
        if (hasPreRun) {
          const preTaskStart = performance.now();
          preRun(controller, params);
          timeRecord.preTask = performance.now() - preTaskStart;
        }
        const taskStart = performance.now();
        run(controller, params);
        timeRecord.task = performance.now() - taskStart;
      } catch (cause) {
        failureReason = new Error("Task failure", { cause });
        i = fullCount;
        j = taskCount;
      }
    }
    const memoryUsage = readMemoryUsage();
    let cleanupTime = 0;
    if (controller.cleanup) {
      const cleanupStart = performance.now();
      controller.cleanup?.();
      cleanupTime = performance.now() - cleanupStart;
    }
    const gcStart = performance.now();
    await garbageCollect();
    const gcTime = performance.now() - gcStart;
    const cleanMemoryUsage = readMemoryUsage();
    results.push({
      setupTime,
      taskTimeRecords,
      cleanupTime,
      gcTime,
      memoryUsage,
      cleanMemoryUsage,
    });
  }
  return {
    results,
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

function printCsv(data: string[][], separator = ",") {
  for (const row of data) {
    console.log(row.join(separator));
  }
}

export interface RunBenchmarkSuiteOptions {
  benchmarkFilter?: (name: string) => boolean;
  frameworkFilter?: (name: string) => boolean;
  verbose?: boolean;
}

export async function runBenchmarkSuite(
  frameworks: FrameworkConfig[],
  benchmarkConfigs: BenchmarkConfig[],
  { verbose, frameworkFilter, benchmarkFilter }: RunBenchmarkSuiteOptions = {}
) {
  const resultKeys = new Set<string>();
  const benchmarksGroup = new Map<string, Map<string, BenchmarkResult[]>>();

  for (const benchmarkConfig of benchmarkConfigs) {
    const benchName = benchmarkConfig.name;
    if (benchmarkFilter ? !benchmarkFilter(benchName) : false) {
      continue;
    }
    const benchmarkBasename = basename(benchmarkConfig.path);
    const resultsGroup = new Map<string, BenchmarkResult[]>();
    benchmarksGroup.set(benchName, resultsGroup);

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
      const response = await runWorker({
        componentConfig: {
          path: join(frameworkPath, benchmarkBasename),
          key: fConfig.componentKey ?? "component",
        },
        benchmarkConfig,
      });
      if (!(response === undefined || response.failureReason)) {
        resultKeys.add(fConfig.name);
        resultsGroup.set(fConfig.name, response.results);
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

  console.log("\nMean setup time in micro seconds:");
  printCsv(
    makeTableFromRecords(resultKeys, processedRecords, "means", "setup", 3)
  );

  console.log("\nMean cleanup time in micro seconds:");
  printCsv(
    makeTableFromRecords(resultKeys, processedRecords, "means", "cleanup", 3)
  );

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
