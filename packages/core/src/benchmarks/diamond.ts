import { createBenchmarkRunner } from "#lib/benchmark";
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

export const diamond = createBenchmarkRunner({
  setup: (component: DiamondComponent, { size }: DiamondParams) =>
    component({
      recordResult: () => {},
      size,
    }),
  preRun: (controller) => {
    controller.writeInput(-1);
    controller.getBody();
  },
  run: (controller) => {
    controller.writeInput(15);
  },
});
