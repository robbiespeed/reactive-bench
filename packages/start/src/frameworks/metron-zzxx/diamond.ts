import type { DiamondComponent } from "@reactive-bench/core/benchmarks/diamond.ts";
import { state, derive, deriveManaged } from "./lib/atom.js";
import { channel } from "#lib/frameworks/metron-o/runtime";
import type { Atom } from "./lib/shared.js";
import { recycleLinks } from "./lib/orb.js";
import type { Disposer } from "./lib/shared.js";

export const component: DiamondComponent = ({ recordResult, size }) => {
  const head = state(-1);
  const disposers: Disposer[] = [];
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
        disposers.pop()!();
      }
      recycleLinks();
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

export const managed: DiamondComponent = ({ recordResult, size }) => {
  const head = state(-1);
  const disposers: Disposer[] = [];
  const body: Atom<number>[] = [];
  for (let n = 0; n < size; n++) {
    const d = deriveManaged((read) => read(head) * n);
    disposers.push(d.own());
    body.push(d);
  }
  const sum = deriveManaged((read) =>
    body.reduce((acc, atom) => acc + read(atom), 0)
  );

  disposers.push(
    sum.own(),
    channel.subscribe(sum, () => {
      recordResult(sum.unwrap());
    })
  );
  recordResult(sum.unwrap());

  return {
    cleanup: () => {
      while (disposers.length) {
        disposers.pop()!();
      }
      recycleLinks();
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
