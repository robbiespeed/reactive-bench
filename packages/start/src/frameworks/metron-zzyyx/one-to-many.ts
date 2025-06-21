import type { OneToManyComponent } from "@reactive-bench/core/benchmarks/one-to-many.ts";
import { channel } from "#lib/frameworks/metron-o/runtime";
import type { Atom, Disposer } from "./lib/shared.js";
import { clean } from "./lib/orb.js";
import { state, derive, map } from "./lib/atom.js";

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
        disposers.pop()!();
      }
      clean();
      channel.run();
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

export const managed: OneToManyComponent = ({
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
    disposers.push(lastRead.manage());
    const row: Atom<number>[] = [lastRead];
    body.push(row);
    for (let x = 1; x < xSize; x++) {
      const prevRead = lastRead;
      lastRead = derive((read) => read(prevRead) + x);
      disposers.push(lastRead.manage());
      row.push(lastRead);
    }
    if (!noEffects) {
      disposers.push(
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
      clean();
      channel.run();
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

export const mapManaged: OneToManyComponent = ({
  recordResult,
  xSize,
  ySize,
  noEffects,
}) => {
  const disposers: Disposer[] = [];
  const head = state(-1);
  const body: Atom<number>[][] = [];
  for (let y = 0; y < ySize; y++) {
    // let lastRead = derive((read) => read(head) + y);
    let lastRead = map(head, (v) => v + y);
    disposers.push(lastRead.manage());
    const row: Atom<number>[] = [lastRead];
    body.push(row);
    for (let x = 1; x < xSize; x++) {
      lastRead = map(lastRead, (v) => v + x);
      disposers.push(lastRead.manage());
      row.push(lastRead);
    }
    if (!noEffects) {
      disposers.push(
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
      clean();
      channel.run();
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
