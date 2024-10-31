import { type CellXComponent, type CellXParams } from "#lib/benchmarks/cellx";
import { createTestRunner } from "#lib/test";
import { deepEqual } from "node:assert";

export interface CellXTestParams extends CellXParams {
  value: number;
  expectedResults: [number, number, number][];
  expectedRows: number[][];
}

export const cellxWriteAllTestCases: CellXTestParams[] = [
  {
    value: 3,
    xSize: 10,
    ySize: 10,
    expectedResults: [
      [0, 0, -1],
      [0, 1, -1],
      [0, 2, -1],
      [0, 3, -1],
      [0, 4, -1],
      [0, 5, -1],
      [0, 6, -1],
      [0, 7, -1],
      [0, 8, -1],
      [0, 9, -1],
      [1, 0, -1],
      [1, 1, 0],
      [1, 2, -2],
      [1, 3, 0],
      [1, 4, -2],
      [1, 5, 0],
      [1, 6, -2],
      [1, 7, 0],
      [1, 8, -2],
      [1, 9, -1],
    ],
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
  },
  {
    value: 7,
    xSize: 24,
    ySize: 5,
    expectedResults: [
      [0, 0, -1],
      [0, 1, -1],
      [0, 2, -1],
      [0, 3, -1],
      [0, 4, -1],
      [1, 0, -1],
      [1, 1, 0],
      [1, 2, -2],
      [1, 3, 0],
      [1, 4, -1],
      [2, 0, 0],
      [2, 1, 1],
      [2, 2, 0],
      [2, 3, -1],
      [2, 4, 0],
      [3, 0, 1],
      [3, 1, 0],
      [3, 2, 0],
      [3, 3, 0],
      [3, 4, -1],
    ],
    expectedRows: [
      [
        7, 7, 0, -7, 0, -7, 0, 7, 0, 7, 0, -7, 0, -7, 0, 7, 0, 7, 0, -7, 0, -7,
        0, 7,
      ],
      [
        7, 0, -7, 0, -7, 0, 7, 0, 7, 0, -7, 0, -7, 0, 7, 0, 7, 0, -7, 0, -7, 0,
        7, 0,
      ],
      [
        7, 14, 0, 0, 0, -14, 0, 0, 0, 14, 0, 0, 0, -14, 0, 0, 0, 14, 0, 0, 0,
        -14, 0, 0,
      ],
      [
        7, 0, 7, 0, -7, 0, -7, 0, 7, 0, 7, 0, -7, 0, -7, 0, 7, 0, 7, 0, -7, 0,
        -7, 0,
      ],
      [
        7, 7, 0, 7, 0, -7, 0, -7, 0, 7, 0, 7, 0, -7, 0, -7, 0, 7, 0, 7, 0, -7,
        0, -7,
      ],
    ],
  },
];

export const cellx = createTestRunner(
  (
    component: CellXComponent,
    { xSize, ySize, value, expectedRows, expectedResults }: CellXTestParams
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
    controller.writeAll(value);
    controller.runDeferred?.();
    for (let y = 0; y < ySize; y++) {
      const row = controller.getRow(y);
      deepEqual(row, expectedRows[y]!);
    }
    deepEqual(results.slice(0, 20), expectedResults);
  }
);
