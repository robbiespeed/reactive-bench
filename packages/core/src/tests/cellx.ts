import { type CellXComponent } from "#lib/benchmarks/cellx";
import type { TestConfig } from "#lib/config";
import { deepEqual, equal, ok } from "node:assert";

export interface CellXTestParams {
  xSize: number;
  ySize: number;
  value: number;
  minResultLength: number;
  expectedRows: number[][];
}

export const cellx = (
  component: CellXComponent,
  { xSize, ySize, value, expectedRows, minResultLength }: CellXTestParams
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
  deepEqual(rows, expectedRows);
  ok(
    results.length >= minResultLength,
    `Got ${results.length} results, expected at least ${minResultLength}`
  );
  controller.cleanup?.();
};

const path = "@reactive-bench/core/tests/cellx.ts";
const key = "cellx";

export const cellxTestConfigs: TestConfig[] = [
  {
    name: "cellx (1)",
    path,
    key,
    params: {
      value: 3,
      xSize: 10,
      ySize: 10,
      minResultLength: 59,
      expectedRows: [
        [3, 3, 0, -3, 0, 0, 0, 3, 0, 0],
        [3, 0, -3, 0, 0, 0, 3, 0, 0, 3],
        [3, 6, 0, -3, 0, -3, 0, 3, -3, 0],
        [3, 0, 0, 0, -3, 0, 0, -3, 0, -3],
        [3, 6, 0, 0, 0, -3, 3, 3, 0, 6],
        [3, 0, 0, 0, 0, 3, 3, 3, 6, -6],
        [3, 6, 0, 0, -3, -6, 0, -3, 6, 9],
        [3, 0, 0, -3, -6, -3, -6, 3, 3, 6],
        [3, 6, 3, 6, 0, 0, -3, -6, 0, -3],
        [3, 3, 6, 3, 6, 0, 0, -3, -6, 0],
      ],
    } satisfies CellXTestParams,
  },
  {
    name: "cellx (2)",
    path,
    key,
    params: {
      value: 7,
      xSize: 20,
      ySize: 5,
      minResultLength: 48,
      expectedRows: [
        [7, 7, 0, -7, 0, -7, 0, 7, 0, 7, 0, -7, 0, -7, 0, 7, 0, 7, 0, -7],
        [7, 0, -7, 0, -7, 0, 7, 0, 7, 0, -7, 0, -7, 0, 7, 0, 7, 0, -7, 0],
        [7, 14, 0, 0, 0, -14, 0, 0, 0, 14, 0, 0, 0, -14, 0, 0, 0, 14, 0, 0],
        [7, 0, 7, 0, -7, 0, -7, 0, 7, 0, 7, 0, -7, 0, -7, 0, 7, 0, 7, 0],
        [7, 7, 0, 7, 0, -7, 0, -7, 0, 7, 0, 7, 0, -7, 0, -7, 0, 7, 0, 7],
      ],
    } satisfies CellXTestParams,
  },
];
