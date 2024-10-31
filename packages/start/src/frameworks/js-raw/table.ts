import {
  TableItem,
  type TableComponent,
  type TableRowDatum,
} from "@reactive-bench/core/benchmarks/table.ts";

export const component: TableComponent = ({ table }) => {
  let nextId = 0;
  let data: TableRowDatum[] = [];
  table.onClear(() => {
    if (data.length) {
      data = [];
      table.items = [];
    }
  });
  table.onAppend((n) => {
    if (n === 0) {
      return;
    }
    const items = table.items;
    for (let i = 0; i < n; i++) {
      const id = nextId++;
      const label = `${i}`;
      const datum: TableRowDatum = { id, label };
      data.push(datum);
      items.push(new TableItem(id, label));
    }
  });
  table.onRemove((i) => {
    data.splice(i, 1);
    table.items.splice(i, 1);
  });
  table.onSwap((a, b) => {
    const items = table.items;
    const tmpItem = items[a]!;
    items[a] = items[b]!;
    items[b] = tmpItem;
    const tmpDatum = data[a]!;
    data[a] = data[b]!;
    data[b] = tmpDatum;
  });
  return {
    getData: () => data,
  };
};
