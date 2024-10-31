import { createBenchmarkRunner } from "#lib/benchmark";
import type { Component, Controller } from "#lib/component";

export interface OneToManyParams {
  xSize: number;
  ySize: number;
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

export const oneToMany = createBenchmarkRunner({
  setup: (
    component: OneToManyComponent,
    { xSize, ySize, noEffects = false }: OneToManyParams
  ) =>
    component({
      recordResult: () => {},
      xSize,
      ySize,
      noEffects,
    }),
  preRun: (controller) => {
    controller.writeInput(-1);
    controller.getBody();
  },
  run: (controller) => {
    controller.writeInput(2);
  },
});
