import type { OneToManyComponent } from "@reactive-bench/core/benchmarks/one-to-many.ts";
import type { Disposer } from "#lib/frameworks/metron/lib/shared";
import { state } from "#lib/frameworks/metron/lib/state";
import type { Atom } from "#lib/frameworks/metron/lib/atom";
import { derive } from "#lib/frameworks/metron/lib/derive";
import { channel } from "#lib/frameworks/metron/runtime";

export const component: OneToManyComponent = ({
  recordResult,
  xSize,
  ySize,
  noEffects,
}) => {
  const disposers: Disposer[] = [];
  const head = state(-1);
  const body: Atom<number>[][] = [];
  for (let y = 0; y < ySize; y++) {
    let lastRead = derive((read) => read(head) + y);
    const row: Atom<number>[] = [lastRead];
    body.push(row);
    for (let x = 1; x < xSize; x++) {
      const prevRead = lastRead;
      lastRead = derive((read) => read(prevRead) + x);
      row.push(lastRead);
    }
    if (!noEffects) {
      recordResult(y, lastRead.unwrap());
      disposers.push(
        channel.subscribe(lastRead, () => {
          recordResult(y, lastRead.unwrap());
        })
      );
    }
  }

  return {
    cleanup() {
      while (disposers.length) {
        disposers.pop()!();
      }
    },
    runDeferred() {
      channel.run();
    },
    writeInput(v) {
      head.set(v);
    },
    getBody() {
      return body.map((row) => row.map((s) => s.unwrap()));
    },
  };
};
