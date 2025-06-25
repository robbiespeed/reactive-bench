import { createBenchmark } from "#lib/benchmark";
import type { Component, Controller } from "#lib/component";

export interface DiamondParams {
  writeCount: number;
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
  setup: (component: DiamondComponent, { size }: DiamondParams) => {
    const controller = component({
      recordResult: () => {},
      size,
    });
    controller.writeInput(-1);
    controller.runDeferred?.();
    controller.getBody();

    return controller;
  },
  run: (controller, { writeCount }) => {
    for (let i = 0; i < writeCount; i++) {
      controller.writeInput(i);
      controller.runDeferred?.();
    }
  },
});
