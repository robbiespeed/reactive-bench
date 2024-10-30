import type { Atom } from "#lib/frameworks/metron/lib/atom";
import { derive } from "#lib/frameworks/metron/lib/derive";
import type { Disposer } from "#lib/frameworks/metron/lib/shared";
import { state, StateAtom } from "#lib/frameworks/metron/lib/state";
import { channel } from "#lib/frameworks/metron/runtime";
import type { CellXComponent } from "@reactive-bench/core/benchmarks/cellx.ts";

export const component: CellXComponent = ({ recordResult, xSize, ySize }) => {
  const disposers: Disposer[] = [];
  const body: Atom<number>[][] = [];
  const sources: StateAtom<number>[] = [];
  for (let y = 0; y < ySize; y++) {
    const source = state(-1);
    disposers.push(
      channel.subscribe(source, () => {
        recordResult(0, y, source.unwrap());
      })
    );
    const yRow: Atom<number>[] = [source];
    sources.push(source);
    body.push(yRow);
  }

  const bottomY = ySize - 1;
  let layer: Atom<number>[] = sources;
  for (let x = 1; x < xSize; x++) {
    const prevLayer = layer;
    const top = derive((read) => read(prevLayer[1]!));
    disposers.push(
      channel.subscribe(top, () => {
        recordResult(x, 0, top.unwrap());
      })
    );
    body[0]!.push(top);
    layer = [top];
    for (let y = 1; y < bottomY; y++) {
      const a = prevLayer[y - 1]!;
      const b = prevLayer[y + 1]!;
      const c = derive(
        y % 2 === 0 ? (read) => read(a) + read(b) : (read) => read(a) - read(b)
      );
      disposers.push(
        channel.subscribe(c, () => {
          recordResult(x, y, c.unwrap());
        })
      );
      body[y]!.push(c);
      layer.push(c);
    }
    const bottom = derive((read) => read(prevLayer[bottomY - 1]!));
    disposers.push(
      channel.subscribe(bottom, () => {
        recordResult(x, bottomY, bottom.unwrap());
      })
    );
    body[bottomY]!.push(bottom);
    layer.push(bottom);
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
    writeRow(y, value) {
      sources[y]!.set(value);
    },
    writeAll(value) {
      for (const source of sources) {
        source.set(value);
      }
    },
    getRow(y) {
      return body[y]!.map((s) => s.unwrap());
    },
  };
};
