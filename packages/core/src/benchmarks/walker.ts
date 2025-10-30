import { createBenchmark } from "#lib/benchmark";
import type { Component, Controller } from "#lib/component";

export interface WalkerParams {
  size: number;
  walkerCount: number;
  stepCount: number;
  isChainStatic: boolean;
}

export interface WalkerController extends Controller {
  step: () => undefined;
  updateChain: () => undefined;
  getWalkerValues: () => number[];
}

export interface WalkerProps {
  size: number;
  walkerCount: number;
}

export type WalkerComponent = Component<WalkerProps, WalkerController>;

export const oneToMany = createBenchmark({
  setup: (
    component: WalkerComponent,
    { size, walkerCount }: WalkerParams
  ) => {
    const controller = component({
      size,
      walkerCount,
    });
    controller.runDeferred?.();
    controller.getWalkerValues();

    return controller;
  },
  run: (controller, { isChainStatic, stepCount }) => {
    if (isChainStatic) {
      for (let i = 0; i < stepCount; i++) {
        controller.step();
        controller.runDeferred?.();
        controller.getWalkerValues();
      }
    } else {
      for (let i = 0; i < stepCount; i++) {
        controller.step();
        controller.updateChain();
        controller.runDeferred?.();
        controller.getWalkerValues();
      }
    }
  },
});
