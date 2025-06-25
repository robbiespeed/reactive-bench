import { clearNode, createNode, runNode, useEffect, useMemo, useState } from "./lib.js";
import type { DiamondComponent, DiamondProps } from "@reactive-bench/core/benchmarks/diamond.ts";

function Diamond ({ size, recordResult }: DiamondProps) {
  const [head, setHead] = useState(-1);
  const body = useMemo(() => {
    const b: number[] = [];
    for (let n = 0; n < size; n++) {
      b.push(head * n);
    }
    return b;
  }, [head]);
  const sum = useMemo(() => body.reduce((acc, v) => acc + v, 0), [body]);
  useEffect(() => {
    recordResult(sum);
  }, [sum]);

  return { sum, setHead, body };
}

export const component: DiamondComponent = (props) => {
  const node = createNode(Diamond, props);
  runNode(node);

  return {
    cleanup () {
      clearNode(node);
    },
    writeInput(v) {
      node.output.setHead(v);
    },
    getSum () {
      return node.output.sum;
    },
    getBody () {
      return node.output.body;
    },
  };
};
