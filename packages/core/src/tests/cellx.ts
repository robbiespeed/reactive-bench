import { type CellXComponent } from "#lib/benchmarks/cellx";
import type { TestConfig } from "#lib/config";
import { deepEqual, equal, ok } from "node:assert";

export interface CellXTestParams {
  xSize: number;
  ySize: number;
  value: number;
  minResultLength: number;
  expectedRowsA: number[][];
  expectedRowsB: number[][];
}

export const cellx = (
  component: CellXComponent,
  { xSize, ySize, value, expectedRowsA, expectedRowsB, minResultLength }: CellXTestParams
) => {
  const results: [number, number, number][] = [];
  const controller = component({
    xSize,
    ySize,
    recordResult(...r) {
      results.push(r);
    },
  });
  controller.runDeferred?.();
  equal(results.length, ySize * xSize);
  results.length = 0;
  controller.writeAll(value);
  controller.runDeferred?.();
  const rows: number[][] = [];
  for (let y = 0; y < ySize; y++) {
    rows.push(controller.getRow(y));
  }
  deepEqual(rows, expectedRowsA);
  ok(
    results.length >= minResultLength,
    `Got ${results.length} results, expected at least ${minResultLength}`
  );
  results.length = 0;
  controller.writeRow(0, value + 1);
  controller.runDeferred?.();
  rows.length = 0;
  for (let y = 0; y < ySize; y++) {
    rows.push(controller.getRow(y));
  }
  deepEqual(rows, expectedRowsB);
  controller.cleanup?.();
};

const path = "@reactive-bench/core/tests/cellx.ts";
const key = "cellx";
const componentPath = "cellx.ts";

export const cellxTestConfigs: TestConfig[] = [
  {
    name: "cellx (1)",
    path,
    key,
    componentPath,
    params: {
      value: 3,
      xSize: 5,
      ySize: 5,
      minResultLength: 7,
      expectedRowsA: [
        [3, 3, 0, -3, 0],
        [3, 0, -3, 0, -3],
        [3, 6, 0, 0, 0],
        [3, 0, 3, 0, -3],
        [3, 3, 0, 3, 0]
      ],
      expectedRowsB: [
        [4, 3, 1, -3, 0],
        [3, 1, -3, 0, -3],
        [3, 6, 1, 0, 1],
        [3, 0, 3, 1, -3],
        [3, 3, 0, 3, 1]
      ],
    } satisfies CellXTestParams,
  },
  {
    name: "cellx (2)",
    path,
    key,
    componentPath,
    params: {
      value: 7,
      xSize: 6,
      ySize: 4,
      minResultLength: 8,
      expectedRowsA: [
        [7, 7, 0, -7, -7, -14],
        [7, 0, -7, -7, -14, -7],
        [7, 14, 7, 7, 0, -7],
        [7, 7, 14, 7, 7, 0],
      ],
      expectedRowsB: [
        [8, 7, 1, -7, -7, -14],
        [7, 1, -7, -7, -14, -8],
        [7, 14, 8, 7, 1, -7],
        [7, 7, 14, 8, 7, 1]
      ]
    } satisfies CellXTestParams,
  },
];
