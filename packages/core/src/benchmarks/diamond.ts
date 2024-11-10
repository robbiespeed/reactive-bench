import { createBenchmark } from "#lib/benchmark";
import type { Component, Controller } from "#lib/component";

export interface DiamondParams {
  size: number;
}

export interface DiamondController extends Controller {
  writeInput: (v: number) => undefined;
  getBody: () => number[];
  getSum: () => number;
}

export interface DiamondProps {
  recordResult: (sum: number) => undefined;
  size: number;
}

export type DiamondComponent = Component<DiamondProps, DiamondController>;

export const diamond = createBenchmark({
  setup: (component: DiamondComponent, { size }: DiamondParams) =>
    component({
      recordResult: () => {},
      size,
    }),
  preRun: (controller) => {
    controller.writeInput(-1);
    controller.getBody();
    controller.runDeferred?.();
  },
  run: (controller) => {
    controller.writeInput(15);
    controller.runDeferred?.();
  },
});
