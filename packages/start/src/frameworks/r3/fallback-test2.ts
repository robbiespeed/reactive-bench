import { strictEqual } from "node:assert";
import { computed, signal, read, type Signal, type Computed, setSignal, stabilize } from "./lib.js";

function computeProjection<TValue>(computeFn: () => TValue): Signal<TValue> {
  let v: Signal<TValue>;
  computed(function (this: Computed<unknown>) {
    if (v === undefined) {
      v = signal(computeFn(), this);
    } else {
      setSignal(v, computeFn());
    }
  });
  return v!;
}

const a = signal(0);

const c1 = computeProjection(() => read(a));
const c2 = computeProjection(() => read(c1));
const c3 = computeProjection(() => read(c2));

const x1 = computeProjection(() => {
  const aVal = read(a)
  if (aVal > 0) {
    read(c3);
  }
  return +(aVal == 2);
});

const x2 = computeProjection(() => read(x1));

const y = computeProjection(() => {
  const aVal = read(c2);
  if (aVal == 2) {
    return aVal + read(x2);
  }
  return aVal;
});

strictEqual(y.value, 0);
setSignal(a, 1);
stabilize();
strictEqual(y.value, 1);
setSignal(a, 2);
stabilize();
strictEqual(y.value, 3);
