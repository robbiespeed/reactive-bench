import { clearNode, createNode, runNode, useEffect, useMemo, useState } from "./lib.js";
import type { OneToManyComponent, OneToManyProps } from "@reactive-bench/core/benchmarks/one-to-many.ts";

interface ItemProps extends OneToManyProps  {
  previousValue: number;
  x: number;
  y: number;
}

function ItemHead (props: ItemProps) {
  const { y, xSize, previousValue, noEffects } = props; 
  const value = useMemo(() => (previousValue + y), [previousValue]);

  const isLast = xSize === 1;
  if (!noEffects && isLast) {
    useEffect(() => {
      props.recordResult(y, value);
    }, [value]);
  }

  return isLast ? [value] : [
    value,
    createNode(Item, { ...props, x: 1, previousValue: value }),
  ];
}

function Item (props: ItemProps) {
  const { x, y, xSize, previousValue, noEffects } = props;
  const value = useMemo(() => (previousValue + x), [previousValue]);

  const nextX = x + 1;
  const isLast = nextX >= xSize;
  if (!noEffects && isLast) {
    useEffect(() => {
      props.recordResult(y, value);
    }, [value]);
  }

  return isLast ? [value] : [value, createNode(Item, { ...props, x: nextX, previousValue: value })];
}

function OneToMany (props: OneToManyProps) {
  const { ySize } = props;
  const [head, setHead] = useState(-1);
  const body: any[] = [];
  for (let y = 0; y < ySize; y++) {
    body.push(createNode(ItemHead, { ...props, x: 0, y, previousValue: head }));
  }
  return [
    { head, setHead },
    ...body,
  ];
}

export const component: OneToManyComponent = (props) => {
  const { ySize } = props;
  const node = createNode(OneToMany, props);
  runNode(node);

  return {
    cleanup () {
      clearNode(node);
    },
    writeInput(v) {
      node.output[0].setHead(v);
    },
    getBody () {
      const body: number[][] = [];
      for (let y = 1; y <= ySize; y++) {
        let n = node.output[y];
        const row: number[] = [];
        while (n) {
          row.push(n.output[0]);
          n = n.output[1];
        }
        body.push(row);
      }
      return body;
    },
  };
};
