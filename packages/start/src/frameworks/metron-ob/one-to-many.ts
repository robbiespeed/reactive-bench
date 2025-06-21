import type { OneToManyComponent } from "@reactive-bench/core/benchmarks/one-to-many.ts";
import { derive } from "#lib/frameworks/metron-o/lib/atom";
import { channel } from "#lib/frameworks/metron-o/runtime";
import type { Atom, Disposer } from "#lib/frameworks/metron-o/lib/shared";
import {
  Orb,
  ORB,
  recycleLinks,
  weaken,
} from "#lib/frameworks/metron-o/lib/orb";
import { state } from "#lib/frameworks/metron-ob/lib/atom";

export const component: OneToManyComponent = ({
  recordResult,
  xSize,
  ySize,
  noEffects,
}) => {
  const disposers: Disposer[] = [];
  const [head, setHead] = state(-1);
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
      disposers.push(
        Orb.hold(lastRead[ORB]),
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
      recycleLinks();
      weaken();
    },
    runDeferred() {
      channel.run();
    },
    writeInput: setHead,
    getBody() {
      return body.map((row) => row.map((s) => s.unwrap()));
    },
  };
};
