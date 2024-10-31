import {
  TableItem,
  type TableComponent,
} from "@reactive-bench/core/benchmarks/table.ts";
import { action, autorun, observable, type IObservableValue } from "mobx";

interface Item {
  id: number;
  label: IObservableValue<string>;
}

export const component: TableComponent = ({ table }) => {
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
        data.push({ id: nextId++, label: observable.box(`${i}`) });
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
  const disposer = autorun(() => {
    table.items = data.map((row) => new TableItem(row.id, row.label.get()));
  });
  return {
    cleanup: () => {
      disposer();
    },
    getData: () => data.map((row) => ({ id: row.id, label: row.label.get() })),
  };
};
