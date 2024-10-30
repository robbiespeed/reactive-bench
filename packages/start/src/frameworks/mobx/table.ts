import { scheduler, wrapDefer } from "#lib/frameworks/mobx/utils";
import type { TableComponent } from "@reactive-bench/core/benchmarks/table.ts";
import { action, autorun, observable, type IObservableValue } from "mobx";

interface Item {
  id: number;
  value: IObservableValue<number>;
}

export const eager: TableComponent = ({ table }) => {
  let nextId = 0;
  const data = observable.array<Item>([]);
  table.onClear(
    action(() => {
      if (data.length !== 0) {
        data.clear();
      }
    })
  );
  table.onAppend(
    action((n) => {
      if (n === 0) {
        return;
      }
      for (let i = 0; i < n; i++) {
        data.push({ id: nextId++, value: observable.box(i) });
      }
    })
  );
  table.onRemove(
    action((i) => {
      data.splice(i, 1);
    })
  );
  table.onSwap(
    action((a, b) => {
      const tmp = data[a]!;
      data[a] = data[b]!;
      data[b] = tmp;
    })
  );
  const disposer = autorun(
    () => {
      table.items = data.map((row) => ({
        id: row.id.toString(),
        value: row.value.get().toString(),
      }));
    },
    { scheduler }
  );
  return {
    cleanup: () => {
      disposer();
    },
    getData: () => data.map((row) => ({ id: row.id, value: row.value.get() })),
  };
};

export const component = wrapDefer(eager);
