import type { OneToManyComponent } from "@reactive-bench/core/benchmarks/one-to-many.ts";
import {
  DerivedAtom,
  StateAtom,
  type Atom,
} from "#lib/frameworks/metron-a/lib/atom";
import { channel } from "#lib/frameworks/metron-a/runtime";
import type { Disposer } from "#lib/frameworks/metron-a/lib/shared";

export const component: OneToManyComponent = ({
  recordResult,
  xSize,
  ySize,
  noEffects,
}) => {
  const disposers: Disposer[] = [];
  const head = new StateAtom(-1);
  const body: Atom<number>[][] = [];
  for (let y = 0; y < ySize; y++) {
    let lastRead = new DerivedAtom((read) => read(head) + y);
    const row: Atom<number>[] = [lastRead];
    body.push(row);
    for (let x = 1; x < xSize; x++) {
      const prevRead = lastRead;
      lastRead = new DerivedAtom((read) => read(prevRead) + x);
      row.push(lastRead);
    }
    if (!noEffects) {
      disposers.push(
        lastRead.hold(),
        channel.subscribe(lastRead, () => {
          recordResult(y, lastRead.unwrap());
        })
      );
      recordResult(y, lastRead.unwrap());
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
