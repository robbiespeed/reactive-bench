import type { BenchmarkRunOptions } from "#lib/benchmark";
import type { CellXParams } from "#lib/benchmarks/cellx";
import type { DiamondParams } from "#lib/benchmarks/diamond";
import type { OneToManyParams } from "#lib/benchmarks/one-to-many";
import type { TableParams } from "#lib/benchmarks/table";
import { cellxTestConfigs } from "#lib/tests/cellx";
import { diamondTestConfigs } from "#lib/tests/diamond";
import { oneToManyTestConfigs } from "#lib/tests/one-to-many";
import { tableTestConfigs } from "#lib/tests/table";

export interface FrameworkConfig {
  name: string;
  path: string;
  componentKey?: string;
  disabledBenchmarks?: string[];
  disabledTests?: string[];
}

export interface ComponentConfig {
  path: string;
  key: string;
}

export interface BenchmarkConfig {
  name: string;
  path: string;
  key: string;
  params: {};
  runOptions?: BenchmarkRunOptions;
}

export interface TestConfig {
  name: string;
  path: string;
  key: string;
  params: {};
  optional?: boolean;
}

export interface BenchmarkSuiteItem {
  componentConfig: ComponentConfig;
  benchmarkConfig: BenchmarkConfig;
}

export interface TestSuiteItem {
  componentConfig: ComponentConfig;
  testConfig: TestConfig;
}

const runOptions: BenchmarkRunOptions = {
  // iterations: 20,
  // time: 1000,
  // warmupIterations: 10,
  // warmupTime: 500,
};

export const benchmarkConfigs: BenchmarkConfig[] = [
  {
    name: "one to many (100x100)",
    path: "@reactive-bench/core/benchmarks/one-to-many.ts",
    key: "oneToMany",
    params: {
      xSize: 100,
      ySize: 100,
      writeCount: 5,
    } satisfies OneToManyParams,
    runOptions,
  },
  {
    name: "one to many (no effects 10x10)",
    path: "@reactive-bench/core/benchmarks/one-to-many.ts",
    key: "oneToMany",
    params: {
      xSize: 10,
      ySize: 10,
      writeCount: 50,
      noEffects: true,
    } satisfies OneToManyParams,
    runOptions,
  },
  {
    name: "one to many (broad 1x1000)",
    path: "@reactive-bench/core/benchmarks/one-to-many.ts",
    key: "oneToMany",
    params: {
      xSize: 1,
      ySize: 1000,
      writeCount: 5,
    } satisfies OneToManyParams,
    runOptions,
  },
  {
    name: "one to many (deep 1000x1)",
    path: "@reactive-bench/core/benchmarks/one-to-many.ts",
    key: "oneToMany",
    params: {
      xSize: 1000,
      ySize: 1,
      writeCount: 5,
    } satisfies OneToManyParams,
    runOptions,
  },
  {
    name: "cellx (write row by row read all 10x50)",
    path: "@reactive-bench/core/benchmarks/cellx.ts",
    key: "cellxWriteRowByRow",
    params: {
      xSize: 10,
      ySize: 50,
      writeCount: 5,
      effectComplexity: 1,
    } satisfies CellXParams,
    runOptions,
  },
  {
    name: "cellx (write read row by row 10x50)",
    path: "@reactive-bench/core/benchmarks/cellx.ts",
    key: "cellxWriteReadRowByRow",
    params: {
      xSize: 10,
      ySize: 50,
      writeCount: 5,
      effectComplexity: 1,
    } satisfies CellXParams,
    runOptions,
  },
  {
    name: "cellx (write read row by row 3x3)",
    path: "@reactive-bench/core/benchmarks/cellx.ts",
    key: "cellxWriteReadRowByRow",
    params: {
      xSize: 3,
      ySize: 3,
      writeCount: 5,
      effectComplexity: 1,
    } satisfies CellXParams,
    runOptions,
  },
  {
    name: "cellx (write all read all 50x50)",
    path: "@reactive-bench/core/benchmarks/cellx.ts",
    key: "cellxWriteAll",
    params: {
      xSize: 50,
      ySize: 50,
      writeCount: 5,
      effectComplexity: 1,
    } satisfies CellXParams,
    runOptions,
  },
  {
    name: "diamond",
    path: "@reactive-bench/core/benchmarks/diamond.ts",
    key: "diamond",
    params: { size: 1000, writeCount: 5 } satisfies DiamondParams,
    runOptions,
  },
  {
    name: "table (fill empty x10_000)",
    path: "@reactive-bench/core/benchmarks/table.ts",
    key: "tableRun",
    params: { appendSize: 10_000 } satisfies TableParams,
    runOptions,
  },
  {
    name: "table (replace x10_000)",
    path: "@reactive-bench/core/benchmarks/table.ts",
    key: "tableReplace",
    params: { appendSize: 10_000 } satisfies TableParams,
    runOptions,
  },
  {
    name: "table (remove one x10_000)",
    path: "@reactive-bench/core/benchmarks/table.ts",
    key: "tableRemove",
    params: { appendSize: 10_000 } satisfies TableParams,
    runOptions,
  },
  {
    name: "table (swap x10_000)",
    path: "@reactive-bench/core/benchmarks/table.ts",
    key: "tableSwap",
    params: { appendSize: 10_000 } satisfies TableParams,
    runOptions,
  },
];

export const testConfigs: TestConfig[] = [
  ...cellxTestConfigs,
  ...diamondTestConfigs,
  ...oneToManyTestConfigs,
  ...tableTestConfigs,
];
