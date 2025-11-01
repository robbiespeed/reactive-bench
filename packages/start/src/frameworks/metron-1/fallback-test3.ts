import { strictEqual } from "node:assert";
import { state, compute, stabilize, type Reader, Atom } from "./lib.js";

function computeProjection<TValue>(computeFn: (read: Reader) => TValue): Atom<TValue> {
  const atomController = Atom.createStateController<TValue>(undefined!);
  const projection = compute((read) => {
    atomController.setState(computeFn(read));
  });
  atomController.setOwner(projection);
  return compute((read) => read(atomController.atom));
}

const [a, setA] = state(0);

const c1 = computeProjection((read) => read(a));
const c2 = computeProjection((read) => read(c1));
const c3 = computeProjection((read) => read(c2));

const x1 = computeProjection((read) => {
  const aVal = read(a)
  if (aVal > 0) {
    read(c3);
  }
  return +(aVal == 2);
});

const x2 = computeProjection((read) => read(x1));

const y = computeProjection((read) => {
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
