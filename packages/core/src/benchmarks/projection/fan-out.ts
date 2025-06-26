import { createBenchmark } from "#lib/benchmark";
import type { Component, Controller } from "#lib/component";

export interface ProjectionFanOutParams {
  depthSize: number;
  fanSize: number;
  writeCount: number;
}

export interface ProjectionFanOutController extends Controller {
  writeInput: (v: number) => undefined;
  getTails: () => boolean[];
}

export interface ProjectionFanOutProps {
  recordResult: (i: number, v: boolean) => undefined;
  depthSize: number;
  fanSize: number;
}

export type ProjectionFanOutComponent = Component<ProjectionFanOutProps, ProjectionFanOutController>;

export const projectionFanOut = createBenchmark({
  setup: (
    component: ProjectionFanOutComponent,
    { depthSize, fanSize }: ProjectionFanOutParams
  ) => {
    const controller = component({
      recordResult: () => {},
      depthSize,
      fanSize,
    });
    controller.writeInput(-1);
    controller.runDeferred?.();
    controller.getTails();

    return controller;
  },
  run: (controller, { writeCount }) => {
    for (let i = 1; i < writeCount; i++) {
      controller.writeInput(i);
      controller.runDeferred?.();
    }
  },
});
