import type {
  ProjectionFanInComponent,
  ProjectionFanInProps,
} from "#lib/benchmarks/projection/fan-in";
import type { TestConfig } from "#lib/config";
import { deepEqual } from "node:assert";

export interface ProjectionFanInTestParams {
  depthSize: number;
  fanSize: number;
  input: number;
  expectedResults: number[];
  expectedTail: number;
}

export const projectionFanIn = (
  component: ProjectionFanInComponent,
  {
    depthSize,
    fanSize,
    input,
    expectedResults,
    expectedTail,
  }: ProjectionFanInTestParams
) => {
  const results: number[] = [];
  const recordResult: ProjectionFanInProps["recordResult"] = (r) => {
    results.push(r);
  };
  const controller = component({
    recordResult,
    depthSize,
    fanSize,
  });
  controller.runDeferred?.();
  controller.getTail();
  controller.writeInput(input);
  controller.runDeferred?.();
  deepEqual(results, expectedResults);
  deepEqual(controller.getTail(), expectedTail);
  controller.cleanup?.();
};

const path = "@reactive-bench/core/tests/projection/fan-in.ts";
const key = "projectionFanIn";
const componentPath = "projection/fan-in.ts";

export const projectionFanInTestConfigs: TestConfig[] = [
  // {
  //   name: "projection fan in (deep jump 20x1000)",
  //   path,
  //   key,
  //   componentPath,
  //   params: {
  //     depthSize: 20,
  //     fanSize: 1000,
  //     input: 3,
  //     expectedResults: [2,3],
  //     expectedTail: 3,
  //   } satisfies ProjectionFanInTestParams,
  // },
  //   {
  //   name: "projection fan in (broad 6)",
  //   path,
  //   key,
  //   componentPath,
  //   params: {
  //     depthSize: 0,
  //     fanSize: 6,
  //     input: 3,
  //     expectedResults: [2,3],
  //     expectedTail: 3,
  //   } satisfies ProjectionFanInTestParams,
  // },
  {
    name: "projection fan in (deep jump 6x6)",
    path,
    key,
    componentPath,
    params: {
      depthSize: 6,
      fanSize: 6,
      input: 8,
      expectedResults: [-1, 26],
      expectedTail: 26,
    } satisfies ProjectionFanInTestParams,
  },
];
