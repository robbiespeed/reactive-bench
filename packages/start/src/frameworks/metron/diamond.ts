import type { DiamondComponent } from "@reactive-bench/core/benchmarks/diamond.ts";
import { state } from "#lib/frameworks/metron/lib/state";
import type { Atom } from "#lib/frameworks/metron/lib/atom";
import { derive } from "#lib/frameworks/metron/lib/derive";
import { channel } from "#lib/frameworks/metron/runtime";

export const component: DiamondComponent = ({ recordResult, size }) => {
  const head = state(-1);
  const body: Atom<number>[] = [];
  for (let n = 0; n < size; n++) {
    body.push(derive(() => head.unwrap() * n));
  }
  const sum = derive((read) => body.reduce((a, s) => a + read(s), 0));
  const disposer = channel.subscribe(sum, () => {
    recordResult(sum.unwrap());
  });

  return {
    cleanup: () => {
      disposer();
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
