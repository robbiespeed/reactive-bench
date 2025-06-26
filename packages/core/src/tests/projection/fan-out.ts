import type {
  ProjectionFanOutComponent,
  ProjectionFanOutProps,
} from "#lib/benchmarks/projection/fan-out";
import type { TestConfig } from "#lib/config";
import { deepEqual } from "node:assert";

export interface ProjectionFanOutTestParams {
  depthSize: number;
  fanSize: number;
  input: number;
  expectedResults: [number, boolean][];
  expectedTails: boolean[];
}

export const projectionFanOut = (
  component: ProjectionFanOutComponent,
  {
    depthSize,
    fanSize,
    input,
    expectedResults,
    expectedTails,
  }: ProjectionFanOutTestParams
) => {
  const results: [number, boolean][] = [];
  const recordResult: ProjectionFanOutProps["recordResult"] = (...r) => {
    results.push(r);
  };
  const controller = component({
    recordResult,
    depthSize,
    fanSize,
  });
  controller.runDeferred?.();
  controller.getTails();
  controller.writeInput(input);
  controller.runDeferred?.();
  deepEqual(results, expectedResults);
  deepEqual(controller.getTails(), expectedTails);
  controller.cleanup?.();
};

const path = "@reactive-bench/core/tests/projection/fan-out.ts";
const key = "projectionFanOut";
const componentPath = "projection/fan-out.ts";

export const projectionFanOutTestConfigs: TestConfig[] = [
  {
    name: "projection fan out (broad 6)",
    path,
    key,
    componentPath,
    params: {
      depthSize: 0,
      fanSize: 6,
      input: 3,
      expectedResults: [
        [ 0, false ],
        [ 1, false ],
        [ 2, false ],
        [ 3, false ],
        [ 4, false ],
        [ 5, false ],
        [ 3, true ]
      ],
      expectedTails: [ false, false, false, true, false, false ],
    } satisfies ProjectionFanOutTestParams,
  },
  {
    name: "projection fan out (deep jump 6x6)",
    path,
    key,
    componentPath,
    params: {
      depthSize: 6,
      fanSize: 6,
      input: 8,
      expectedResults: [
        [ 0, false ],
        [ 1, false ],
        [ 2, false ],
        [ 3, false ],
        [ 4, false ],
        [ 5, false ],
        [ 5, true ]
      ],
      expectedTails: [ false, false, false, false, false, true ],
    } satisfies ProjectionFanOutTestParams,
  },
];
