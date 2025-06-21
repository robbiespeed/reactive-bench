import type { ORB, Orb } from "./orb.js";

export interface Disposer {
  (): void;
}

export interface ReadableFn<T> {
  (read: Reader): T;
}

export interface Atom<T> {
  unwrap(): T;
  [ORB]: Orb;
}

export interface Reader {
  <T>(readable: Atom<T>): T;
}

export const EMPTY_CACHE = Symbol();
export const NOOP = (): undefined => {};
