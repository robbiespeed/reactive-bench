import type { Component, Controller } from "#lib/component";
import { garbageCollect } from "#lib/gc";
import { readMemoryUsage } from "#lib/memory";

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

export interface BenchmarkRunner<TComponent extends Component<any>, TParams> {
  (
    component: TComponent,
    params: TParams,
    runOptions?: BenchmarkRunOptions
  ): Promise<BenchmarkRunResponse>;
}

export interface BenchmarkConfig<
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
  shouldCheck?: boolean;
}

export function createBenchmarkRunner<
  TComponent extends Component<any>,
  TParams,
  TRunController extends Controller
>(
  config: BenchmarkConfig<TComponent, TParams, TRunController>
): BenchmarkRunner<TComponent, TParams> {
  return async (
    Component,
    params,
    { fullCount = 5, taskCount = 100, shouldCheck = true } = {}
  ) => {
    if (fullCount < 1) {
      throw new Error("fullCount must be 1 or greater");
    }
    if (taskCount < 0) {
      throw new Error("taskCount must be 0 or greater");
    }
    const { setup, run, preRun } = config;
    const hasPreRun = preRun !== undefined;
    const results: BenchmarkResult[] = [];
    let failureReason: undefined | Error;
    for (let i = 0; i < fullCount; i++) {
      const setupStart = performance.now();
      const controller = setup(Component, params);
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
            controller.runDeferred?.();
            timeRecord.preTask = performance.now() - preTaskStart;
          }
          const taskStart = performance.now();
          run(controller, params);
          controller.runDeferred?.();
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
  };
}
