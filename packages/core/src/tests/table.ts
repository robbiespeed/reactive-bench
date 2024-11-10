import {
  createTable,
  TableItem,
  type TableComponent,
  type TableParams,
  type TableRowDatum,
} from "#lib/benchmarks/table";
import type { TestConfig } from "#lib/config";
import { deepEqual, equal, ok } from "node:assert";

export interface TableTestParams extends TableParams {
  expectedData: TableRowDatum[];
}

export const tableRun = (
  component: TableComponent,
  { appendSize, expectedData }: TableTestParams
) => {
  const tableController = createTable();
  const table = tableController.model;
  const controller = component({ table });
  controller.runDeferred?.();
  equal(table.items.length, 0);
  tableController.append(appendSize);
  controller.runDeferred?.();
  deepEqual(controller.getData(), expectedData);
  equal(table.items.length, appendSize);
  ok(
    table.items.every((item) => TableItem.isTableItem(item)),
    "Detected item which was not a TableItem"
  );
};

const path = "@reactive-bench/core/tests/table.ts";

export const tableTestConfigs: TestConfig[] = [
  {
    name: "table run",
    path,
    key: "tableRun",
    params: {
      appendSize: 2,
      expectedData: [
        { id: 0, label: "0" },
        { id: 1, label: "1" },
      ],
    } satisfies TableTestParams,
  },
];
