import { derive } from "#lib/frameworks/metron-o/lib/atom";
import {
  ORB,
  Orb,
  recycleLinks,
  weaken,
} from "#lib/frameworks/metron-o/lib/orb";
import type { Atom, Disposer } from "#lib/frameworks/metron-o/lib/shared";
import { channel } from "#lib/frameworks/metron-o/runtime";
import { state } from "#lib/frameworks/metron-ob/lib/atom";
import type { CellXComponent } from "@reactive-bench/core/benchmarks/cellx.ts";

export const component: CellXComponent = ({ recordResult, xSize, ySize }) => {
  const disposers: Disposer[] = [];
  const body: Atom<number>[][] = [];
  const sources: Atom<number>[] = [];
  const setters: ((v: number) => undefined)[] = [];
  for (let y = 0; y < ySize; y++) {
    const [source, setSource] = state(-1);

    disposers.push(
      Orb.hold(source[ORB]),
      channel.subscribe(source, () => {
        recordResult(0, y, source.unwrap());
      })
    );
    recordResult(0, y, source.unwrap());

    const yRow: Atom<number>[] = [source];
    sources.push(source);
    setters.push(setSource);
    body.push(yRow);
  }

  const bottomY = ySize - 1;
  let layer: Atom<number>[] = sources;
  for (let x = 1; x < xSize; x++) {
    const prevLayer = layer;
    const top = derive((read) => read(prevLayer[1]!));

    disposers.push(
      Orb.hold(top[ORB]),
      channel.subscribe(top, () => {
        recordResult(x, 0, top.unwrap());
      })
    );
    recordResult(x, 0, top.unwrap());

    body[0]!.push(top);
    layer = [top];
    for (let y = 1; y < bottomY; y++) {
      const a = prevLayer[y - 1]!;
      const b = prevLayer[y + 1]!;
      const c = derive(
        y % 2 === 0 ? (read) => read(a) + read(b) : (read) => read(a) - read(b)
      );

      disposers.push(
        Orb.hold(c[ORB]),
        channel.subscribe(c, () => {
          recordResult(x, y, c.unwrap());
        })
      );
      recordResult(x, y, c.unwrap());

      body[y]!.push(c);
      layer.push(c);
    }
    const bottom = derive((read) => read(prevLayer[bottomY - 1]!));

    disposers.push(
      Orb.hold(bottom[ORB]),
      channel.subscribe(bottom, () => {
        recordResult(x, bottomY, bottom.unwrap());
      })
    );
    recordResult(x, bottomY, bottom.unwrap());

    body[bottomY]!.push(bottom);
    layer.push(bottom);
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
    writeRow(y, value) {
      setters[y]!(value);
    },
    writeAll(value) {
      for (const set of setters) {
        set(value);
      }
    },
    getRow(y) {
      return body[y]!.map((s) => s.unwrap());
    },
  };
};
