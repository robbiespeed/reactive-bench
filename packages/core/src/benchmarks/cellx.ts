import { createBenchmark } from "#lib/benchmark";
import type { Component, Controller } from "#lib/component";

export interface CellXParams {
  xSize: number;
  ySize: number;
}

export interface CellXRowByRowParams extends CellXParams {
  xSize: number;
  ySize: number;
  rowWriteCount: number;
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

const setup = (component: CellXComponent, { xSize, ySize }: CellXParams) =>
  component({
    recordResult: () => {},
    xSize,
    ySize,
  });

const preRun = (
  controller: CellXController,
  { ySize }: CellXParams
): undefined => {
  controller.writeAll(-1);
  for (let y = 0; y < ySize; y++) {
    controller.getRow(y);
  }
};

export const cellxWriteRowByRow = createBenchmark({
  setup: setup,
  preRun: preRun,
  run: (
    { writeRow, getRow, runDeferred },
    { rowWriteCount }: CellXRowByRowParams
  ) => {
    for (let y = 0; y < rowWriteCount; y++) {
      writeRow(y, 10);
      getRow(y);
    }
    runDeferred?.();
  },
});

export const cellxWriteAll = createBenchmark({
  setup: setup,
  preRun: preRun,
  run: ({ writeAll, runDeferred }) => {
    writeAll(20);
    runDeferred?.();
  },
});
