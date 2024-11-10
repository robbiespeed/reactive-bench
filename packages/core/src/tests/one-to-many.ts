import type {
  OneToManyComponent,
  OneToManyParams,
  OneToManyProps,
} from "#lib/benchmarks/one-to-many";
import type { TestConfig } from "#lib/config";
import { deepEqual } from "node:assert";

export interface OneToManyTestParams extends OneToManyParams {
  input: number;
  expectedResults: [number, number][];
  expectedBody: number[][];
}

export const oneToMany = (
  component: OneToManyComponent,
  {
    xSize,
    ySize,
    input,
    expectedResults,
    expectedBody,
    noEffects = false,
  }: OneToManyTestParams
) => {
  const results: [number, number][] = [];
  const recordResult: OneToManyProps["recordResult"] = (...r) => {
    results.push(r);
  };
  const controller = component({
    recordResult,
    xSize,
    ySize,
    noEffects,
  });
  controller.runDeferred?.();
  controller.writeInput(input);
  controller.runDeferred?.();
  controller.writeInput(input + 1);
  controller.runDeferred?.();
  deepEqual(results, expectedResults);
  deepEqual(controller.getBody(), expectedBody);
};

const path = "@reactive-bench/core/tests/one-to-many.ts";
const key = "oneToMany";

export const oneToManyTestConfigs: TestConfig[] = [
  {
    name: "one to many (broad 1x6)",
    path,
    key,
    params: {
      xSize: 1,
      ySize: 6,
      input: 3,
      expectedResults: [
        [0, -1],
        [1, 0],
        [2, 1],
        [3, 2],
        [4, 3],
        [5, 4],
        [0, 3],
        [1, 4],
        [2, 5],
        [3, 6],
        [4, 7],
        [5, 8],
        [0, 4],
        [1, 5],
        [2, 6],
        [3, 7],
        [4, 8],
        [5, 9],
      ],
      expectedBody: [[4], [5], [6], [7], [8], [9]],
    },
  },
  {
    name: "one to many (deep 6x1)",
    path,
    key,
    params: {
      xSize: 6,
      ySize: 1,
      input: 5,
      expectedResults: [
        [0, 14],
        [0, 20],
        [0, 21],
      ],
      expectedBody: [[6, 7, 9, 12, 16, 21]],
    },
  },
  {
    name: "one to many (3x3)",
    path,
    key,
    params: {
      xSize: 3,
      ySize: 3,
      input: 2,
      expectedResults: [
        [0, 2],
        [1, 3],
        [2, 4],
        [0, 5],
        [1, 6],
        [2, 7],
        [0, 6],
        [1, 7],
        [2, 8],
      ],
      expectedBody: [
        [3, 4, 6],
        [4, 5, 7],
        [5, 6, 8],
      ],
    },
  },
  {
    name: "one to many (no effects 3x3)",
    path,
    key,
    params: {
      xSize: 3,
      ySize: 3,
      noEffects: true,
      input: 2,
      expectedResults: [],
      expectedBody: [
        [3, 4, 6],
        [4, 5, 7],
        [5, 6, 8],
      ],
    },
  },
];
