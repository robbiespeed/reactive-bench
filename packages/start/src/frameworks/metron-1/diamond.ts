import type { DiamondComponent } from "@reactive-bench/core/benchmarks/diamond.ts";
import { Atom, clean, state, stabilize, AtomSubscriptionChannel, derive, type AtomSubscription } from "./lib.js";

export const component: DiamondComponent = ({ recordResult, size }) => {
  const channel = new AtomSubscriptionChannel(() => { });
  const [head, setHead] = state(-1);
  const disposers: AtomSubscription[] = [];
  const body: Atom<number>[] = [];
  for (let n = 0; n < size; n++) {
    const d = derive((read) => read(head) * n);
    body.push(d);
  }
  const sum = derive((read) => body.reduce((acc, atom) => acc + read(atom), 0));

  disposers.push(
    channel.subscribe(sum, () => {
      recordResult(sum.unwrap());
    })
  );
  recordResult(sum.unwrap());

  return {
    cleanup: () => {
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
    getSum() {
      return sum.unwrap();
    },
    getBody() {
      return body.map((s) => s.unwrap());
    },
  };
};