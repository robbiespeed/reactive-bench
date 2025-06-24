import { createBenchmark } from "#lib/benchmark";
import type { Component, Controller } from "#lib/component";
import { fib } from "#lib/math";

export interface CellXParams {
  xSize: number;
  ySize: number;
  writeCount: number;
  effectComplexity: number;
}

export interface CellXController extends Controller {
  writeRow: (y: number, value: number) => undefined;
  writeAll: (value: number) => undefined;
  getRow: (y: number) => number[];
}

export interface CellXProps {
  recordResult: (x: number, y: number, v: number) => undefined;
  xSize: number;
  ySize: number;
}

export type CellXComponent = Component<CellXProps, CellXController>;

const setup = (
  component: CellXComponent,
  { xSize, ySize, effectComplexity }: CellXParams
) => {
  const controller = component({
    recordResult: effectComplexity
      ? () => {
          fib(effectComplexity);
        }
      : () => {},
    xSize,
    ySize,
  });

  controller.writeAll(-1);
  for (let y = 0; y < ySize; y++) {
    controller.getRow(y);
  }
  controller.runDeferred?.();

  return controller;
};

function getAllRows(getRow: (y: number) => number[], ySize: number): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < ySize; y++) {
    rows.push(getRow(y));
  }
  return rows;
}

export const cellxWriteReadRowByRow = createBenchmark({
  setup,
  run: (
    { writeRow, getRow, runDeferred },
    { ySize, writeCount }: CellXParams
  ) => {
    for (let i = 0; i < writeCount; i++) {
      for (let y = 0; y < ySize; y++) {
        writeRow(y, i);
        runDeferred?.();
        getRow(y);
      }
    }
  },
});

export const cellxWriteRowByRow = createBenchmark({
  setup,
  run: (
    { writeRow, getRow, runDeferred },
    { ySize, writeCount }: CellXParams
  ) => {
    for (let i = 0; i < writeCount; i++) {
      for (let y = 0; y < ySize; y++) {
        writeRow(y, i);
      }
      runDeferred?.();
      getAllRows(getRow, ySize);
    }
  },
});

export const cellxWriteAll = createBenchmark({
  setup,
  run: ({ writeAll, runDeferred, getRow }, { writeCount, ySize }) => {
    for (let i = 0; i < writeCount; i++) {
      writeAll(i);
      runDeferred?.();
      getAllRows(getRow, ySize);
    }
  },
});
