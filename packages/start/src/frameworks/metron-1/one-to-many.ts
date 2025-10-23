import type { OneToManyComponent } from "@reactive-bench/core/benchmarks/one-to-many.ts";
import { Atom, clean, state, stabilize, AtomSubscriptionChannel, derive, type AtomSubscription } from "./lib.js";

export const component: OneToManyComponent = ({
  recordResult,
  xSize,
  ySize,
  noEffects,
}) => {
  const channel = new AtomSubscriptionChannel(() => { });
  const disposers: AtomSubscription[] = [];
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
        // Orb.hold(lastRead[ORB]),
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
        disposers.pop()!.dispose();
      }
      clean();
      channel.clear();
    },
    runDeferred() {
      stabilize();
      channel.run();
    },
    writeInput(v) {
      setHead(v);
    },
    getBody() {
      return body.map((row) => row.map((s) => s.unwrap()));
    },
  };
};