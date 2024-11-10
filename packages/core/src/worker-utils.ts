import type { BenchmarkRunResponse } from "#lib/benchmark";
import type { BenchmarkSuiteItem, TestSuiteItem } from "#lib/config";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

export function getWorkerPath() {
  const selfDirname = dirname(fileURLToPath(import.meta.url));
  return join(
    selfDirname,
    selfDirname.endsWith("src") ? "worker.ts" : "worker.js"
  );
}

export async function runWorker(
  workerData: BenchmarkSuiteItem
): Promise<BenchmarkRunResponse | undefined>;
export async function runWorker(
  workerData: TestSuiteItem
): Promise<Error | true | undefined>;
export async function runWorker(
  workerData: BenchmarkSuiteItem | TestSuiteItem
) {
  const workerPath = getWorkerPath();
  const worker = new Worker(workerPath, { workerData });

  const response: unknown = await new Promise((resolve) => {
    worker.once("message", resolve);
  });

  await worker.terminate();

  return response;
}
