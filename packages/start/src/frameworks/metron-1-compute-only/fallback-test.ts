import { strictEqual } from "node:assert";
import { state, compute, stabilize } from "./lib.js";


const [a, setA] = state(0);
const c1 = compute((read) => read(a));
const c2 = compute((read) => read(c1));
const c3 = compute((read) => read(c2));

const x1 = compute((read) => {
  const aVal = read(a)
  if (aVal > 0) {
    read(c3);
  }
  return +(aVal == 2);
});

const x2 = compute((read) => read(x1));

const y = compute((read) => {
  const aVal = read(c2);
  if (aVal == 2) {
    return aVal + read(x2);
  }
  return aVal;
});

strictEqual(y.unwrap(), 0);
setA(1);
stabilize();
strictEqual(y.unwrap(), 1);
setA(2);
stabilize();
strictEqual(y.unwrap(), 3);
