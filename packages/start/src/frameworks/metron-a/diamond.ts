import type { DiamondComponent } from "@reactive-bench/core/benchmarks/diamond.ts";
import {
  DerivedAtom,
  StateAtom,
  type Atom,
} from "#lib/frameworks/metron-a/lib/atom";
import { channel } from "#lib/frameworks/metron-a/runtime";

export const component: DiamondComponent = ({ recordResult, size }) => {
  const head = new StateAtom(-1);
  const body: Atom<number>[] = [];
  for (let n = 0; n < size; n++) {
    body.push(new DerivedAtom((read) => read(head) * n));
  }
  const sum = new DerivedAtom((read) =>
    body.reduce((acc, atom) => acc + read(atom), 0)
  );

  const holdDisposer = sum.hold();
  const disposer = channel.subscribe(sum, () => {
    recordResult(sum.unwrap());
  });
  recordResult(sum.unwrap());

  return {
    cleanup: () => {
      disposer();
      holdDisposer();
    },
    runDeferred() {
      channel.run();
    },
    writeInput(v) {
      head.set(v);
    },
    getSum() {
      return sum.unwrap();
    },
    getBody() {
      return body.map((s) => s.unwrap());
    },
  };
};
