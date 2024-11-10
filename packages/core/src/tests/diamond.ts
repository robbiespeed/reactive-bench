import type {
  DiamondComponent,
  DiamondParams,
  DiamondProps,
} from "#lib/benchmarks/diamond";
import type { TestConfig } from "#lib/config";
import { deepEqual, equal } from "node:assert";

export interface DiamondTestParams extends DiamondParams {
  input: number;
  expectedSums: number[];
  expectedBody: number[];
}

export const diamond = (
  component: DiamondComponent,
  { size, input, expectedSums, expectedBody }: DiamondTestParams
) => {
  const results: number[] = [];
  const recordResult: DiamondProps["recordResult"] = (v) => {
    results.push(v);
  };
  const controller = component({ recordResult, size });
  controller.runDeferred?.();
  equal(results[0], expectedSums[0]);
  controller.writeInput(input);
  controller.runDeferred?.();
  equal(results[1], expectedSums[1]);
  deepEqual(controller.getBody(), expectedBody);
};

const path = "@reactive-bench/core/tests/diamond.ts";
const key = "diamond";

export const diamondTestConfigs: TestConfig[] = [
  {
    name: "diamond (1)",
    path,
    key,
    params: {
      size: 5,
      input: 3,
      expectedSums: [-10, 30],
      expectedBody: [0, 3, 6, 9, 12],
    } satisfies DiamondTestParams,
  },
  {
    name: "diamond (2)",
    path,
    key,
    params: {
      size: 8,
      input: 7,
      expectedSums: [-28, 196],
      expectedBody: [0, 7, 14, 21, 28, 35, 42, 49],
    } satisfies DiamondTestParams,
  },
];
