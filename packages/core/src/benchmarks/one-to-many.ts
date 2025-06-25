import { createBenchmark } from "#lib/benchmark";
import type { Component, Controller } from "#lib/component";

export interface OneToManyParams {
  xSize: number;
  ySize: number;
  writeCount: number;
  noEffects?: boolean;
}

export interface OneToManyController extends Controller {
  writeInput: (v: number) => undefined;
  getBody: () => number[][];
}

export interface OneToManyProps {
  recordResult: (y: number, v: number) => undefined;
  xSize: number;
  ySize: number;
  noEffects: boolean;
}

export type OneToManyComponent = Component<OneToManyProps, OneToManyController>;

export const oneToMany = createBenchmark({
  setup: (
    component: OneToManyComponent,
    { xSize, ySize, noEffects = false }: OneToManyParams
  ) => {
    const controller = component({
      recordResult: () => {},
      xSize,
      ySize,
      noEffects,
    });
    controller.writeInput(-1);
    controller.runDeferred?.();
    controller.getBody();

    return controller;
  },
  run: (controller, { writeCount, noEffects }) => {
    if (noEffects) {
      for (let i = 0; i < writeCount; i++) {
        controller.writeInput(i);
        controller.runDeferred?.();
        controller.getBody();
      }
    } else {
      for (let i = 0; i < writeCount; i++) {
        controller.writeInput(i);
        controller.runDeferred?.();
      }
    }
  },
});
