import { benchmarkConfigs, frameworkConfigs } from "#lib/config";
import type { WorkerParams } from "#lib/worker";
import type {
  BenchmarkResult,
  BenchmarkRunResponse,
} from "@reactive-bench/core/benchmark.ts";
import { garbageCollect } from "@reactive-bench/core/gc.ts";
import {
  getProcessedGroupRecords,
  type BenchmarkRecord,
} from "@reactive-bench/core/stats.ts";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const benchFilter = process.argv[2] || undefined;

const selfDirname = dirname(fileURLToPath(import.meta.url));
const workerPath = join(
  selfDirname,
  selfDirname.endsWith("src") ? "worker.ts" : "worker.js"
);

async function runBenchmark(workerData: WorkerParams) {
  const worker = new Worker(workerPath, {
    workerData,
  });

  const response: BenchmarkRunResponse | undefined = await new Promise(
    (resolve) => {
      worker.once("message", resolve);
    }
  );

  if (response) {
    if (response.failureReason) {
      console.log(response.failureReason);
    } else {
      // Uncomment to see detailed stats for the benchmarks runs
      // const stats = benchResultsToStats(response.results);
      // console.table(stats);
    }
  } else {
    console.log("Benchmark or implementation missing", workerData);
  }

  await worker.terminate();
  await garbageCollect();

  return response;
}

const resultKeys = new Set<string>();
const benchmarksGroup = new Map<string, Map<string, BenchmarkResult[]>>();

for (const benchmarkConfig of benchmarkConfigs) {
  if (benchFilter && !benchmarkConfig.key.includes(benchFilter)) {
    continue;
  }
  // console.log(`Bench: ${benchmarkConfig.path} > ${benchmarkConfig.key}`);
  const benchmarkBasename = basename(benchmarkConfig.path);

  const resultsGroup = new Map<string, BenchmarkResult[]>();
  benchmarksGroup.set(benchmarkConfig.key, resultsGroup);

  for (const frameworkConfig of frameworkConfigs) {
    const frameworkPath = frameworkConfig.path;
    const overrides =
      frameworkConfig.componentOverrides?.[benchmarkConfig.path];
    if (overrides === undefined) {
      // console.log(`Framework: ${frameworkPath}`);
      const response = await runBenchmark({
        componentConfig: {
          path: join(frameworkPath, benchmarkBasename),
          key: "component",
        },
        benchmarkConfig,
      });
      if (!(response === undefined || response.failureReason)) {
        resultKeys.add(frameworkConfig.name);
        resultsGroup.set(frameworkConfig.name, response.results);
      }
      continue;
    }

    let i = 1;
    for (const override of overrides) {
      const overridePath = override.path ?? benchmarkBasename;
      const overrideKey = override.key ?? "component";

      // console.log(
      //   `Framework: ${frameworkPath} (${i}: ${overridePath} > ${overrideKey})`
      // );

      const response = await runBenchmark({
        componentConfig: {
          path: join(frameworkPath, overridePath),
          key: overrideKey,
        },
        benchmarkConfig,
      });
      if (!(response === undefined || response.failureReason)) {
        const key =
          i === 1 ? frameworkConfig.name : `${frameworkConfig.name}:${i}`;
        resultKeys.add(key);
        resultsGroup.set(key, response.results);
        i++;
      }
    }
  }
}

const processedRecords = [...benchmarksGroup].map(
  ([name, group]) => [name, getProcessedGroupRecords(group)] as const
);

function makeTableFromRecords(
  recordKey: "means" | "normalizedMeans",
  subKey: keyof BenchmarkRecord<any>,
  fractionDigits = 0,
  missingSymbol = "-"
) {
  const table = [];
  table.push(["bench", ...resultKeys]);
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

console.log("\nMean setup time in micro seconds:");
printCsv(makeTableFromRecords("means", "setup", 3));

console.log("\nMean cleanup time in micro seconds:");
printCsv(makeTableFromRecords("means", "cleanup", 3));

console.log("\nMean memory in kb:");
printCsv(makeTableFromRecords("means", "memory"));

console.log("\nMean task time in micro seconds:");
printCsv(makeTableFromRecords("means", "task", 3));

console.log("\nNormalized mean task time:");
printCsv(makeTableFromRecords("normalizedMeans", "task", 1));
