import { createBenchmarkRunner } from "#lib/benchmark";
import type { Component, Controller } from "#lib/component";

export interface CellXParams {
  xSize: number;
  ySize: number;
  minWrite: number;
  maxWrite: number;
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

const preRun = (controller: CellXController): undefined => {
  controller.writeAll(-1);
};

export const cellxWriteRowByRow = createBenchmarkRunner({
  setup,
  preRun: preRun,
  run: (
    { writeRow, getRow },
    { minWrite, maxWrite, rowWriteCount }: CellXParams
  ) => {
    for (let y = 0; y < rowWriteCount; y++) {
      for (let v = minWrite; v < maxWrite; v++) {
        writeRow(y, v);
      }
      getRow(y);
    }
  },
});

export const cellxWriteAll = createBenchmarkRunner({
  setup,
  preRun: preRun,
  run: ({ writeAll }, { minWrite, maxWrite }: CellXParams) => {
    for (let v = minWrite; v < maxWrite; v++) {
      writeAll(v);
    }
  },
});
