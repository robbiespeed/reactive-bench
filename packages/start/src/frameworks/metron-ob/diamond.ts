import type { DiamondComponent } from "@reactive-bench/core/benchmarks/diamond.ts";
import { derive } from "#lib/frameworks/metron-o/lib/atom";
import { channel } from "#lib/frameworks/metron-o/runtime";
import type { Atom } from "#lib/frameworks/metron-o/lib/shared";
import {
  Orb,
  ORB,
  recycleLinks,
  weaken,
} from "#lib/frameworks/metron-o/lib/orb";
import { state } from "#lib/frameworks/metron-ob/lib/atom";

export const component: DiamondComponent = ({ recordResult, size }) => {
  const [head, setHead] = state(-1);
  const body: Atom<number>[] = [];
  for (let n = 0; n < size; n++) {
    body.push(derive((read) => read(head) * n));
  }
  const sum = derive((read) => body.reduce((acc, atom) => acc + read(atom), 0));

  const holdDisposer = Orb.hold(sum[ORB]);
  const disposer = channel.subscribe(sum, () => {
    recordResult(sum.unwrap());
  });
  recordResult(sum.unwrap());

  return {
    cleanup: () => {
      disposer();
      holdDisposer();
      recycleLinks();
      weaken();
    },
    runDeferred() {
      channel.run();
    },
    writeInput: setHead,
    getSum() {
      return sum.unwrap();
    },
    getBody() {
      return body.map((s) => s.unwrap());
    },
  };
};
