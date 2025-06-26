import { createBenchmark } from "#lib/benchmark";
import type { Component, Controller } from "#lib/component";

export interface ProjectionFanInParams {
  depthSize: number;
  fanSize: number;
  writeCount: number;
}

export interface ProjectionFanInController extends Controller {
  writeInput: (v: number) => undefined;
  getTail: () => number;
}

export interface ProjectionFanInProps {
  recordResult: (v: number) => undefined;
  depthSize: number;
  fanSize: number;
}

export type ProjectionFanInComponent = Component<ProjectionFanInProps, ProjectionFanInController>;

export const projectionFanIn = createBenchmark({
  setup: (
    component: ProjectionFanInComponent,
    { depthSize, fanSize }: ProjectionFanInParams
  ) => {
    const controller = component({
      recordResult: () => {},
      depthSize,
      fanSize,
    });
    controller.writeInput(-1);
    controller.runDeferred?.();
    controller.getTail();

    return controller;
  },
  run: (controller, { writeCount }) => {
    for (let i = 1; i < writeCount; i++) {
      controller.writeInput(i);
      controller.runDeferred?.();
    }
  },
});
