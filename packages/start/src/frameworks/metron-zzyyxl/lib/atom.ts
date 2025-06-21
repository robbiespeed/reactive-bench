import { Emitter, EMITTER } from "./emitter.js";
import {
  Orb,
  ORB,
  orbCreateStaticFn,
  orbLinkStatic,
  orbManage,
  orbReceive,
  orbTransmit,
  orbWrapFnWithReader,
  type StaticDeriver,
} from "./orb.js";
import { EMPTY_CACHE, type Atom, type Reader } from "./shared.js";

export class StateAtom<T> implements Atom<T> {
  #emitter: Emitter | undefined;
  #orb: Orb | undefined;
  #store: T;
  constructor(initialValue: T) {
    this.#store = initialValue;
  }
  set(value: T): undefined {
    if (value === this.#store) {
      return;
    }
    this.#store = value;
    this.#emitter?.emit();
    if (this.#orb !== undefined) {
      orbTransmit(this.#orb);
    }
  }
  unwrap(): T {
    return this.#store;
  }
  get [ORB]() {
    return (this.#orb ??= new Orb());
  }
  get [EMITTER]() {
    return (this.#emitter ??= new Emitter());
  }
}

export const state = <T>(initialValue: T) => new StateAtom(initialValue);

export class DeriveAtom<T> implements Atom<T> {
  #emitter: Emitter | undefined;
  #orb!: Orb;
  #deriveFn: (read: Reader) => T;
  #store: T | typeof EMPTY_CACHE = EMPTY_CACHE;
  constructor(derivation: (read: Reader) => T) {
    this.#orb = new Orb();
    this.#orb.intercept = () => {
      if (this.#store === EMPTY_CACHE) {
        return false;
      }
      this.#store = EMPTY_CACHE;
      this.#emitter?.emit();
      return true;
    };
    this.#deriveFn = derivation;
  }
  unwrap(): T {
    if (this.#store !== EMPTY_CACHE) {
      return this.#store;
    }
    this.#store = orbReceive(this.#orb, this.#deriveFn);
    return this.#store;
  }
  get [ORB]() {
    return this.#orb;
  }
  get [EMITTER]() {
    return (this.#emitter ??= new Emitter());
  }
  manage() {
    return orbManage(this.#orb);
  }
}

export const deriveO = <T>(derivation: (read: Reader) => T) =>
  new DeriveAtom(derivation);

export class DeriveSyncAtom<T> implements Atom<T> {
  #emitter: Emitter | undefined;
  #orb!: Orb;
  #deriveFn: () => T;
  #store: T | typeof EMPTY_CACHE = EMPTY_CACHE;
  constructor(derivation: (read: Reader) => T) {
    this.#orb = new Orb();
    this.#orb.intercept = () => {
      if (this.#store === EMPTY_CACHE) {
        return false;
      }
      this.#store = EMPTY_CACHE;
      this.#emitter?.emit();
      return true;
    };
    this.#deriveFn = orbWrapFnWithReader(this.#orb, derivation);
  }
  unwrap(): T {
    if (this.#store !== EMPTY_CACHE) {
      return this.#store;
    }
    this.#store = this.#deriveFn();
    return this.#store;
  }
  get [ORB]() {
    return this.#orb;
  }
  get [EMITTER]() {
    return (this.#emitter ??= new Emitter());
  }
  manage() {
    return orbManage(this.#orb);
  }
}

export const derive = <T>(derivation: (read: Reader) => T) =>
  new DeriveAtom(derivation);

export class DeriveStaticAtom<
  D extends StaticDeriver<unknown>,
  T extends ReturnType<D["run"]>
> implements Atom<T>
{
  #emitter: Emitter | undefined;
  #orb!: Orb;
  #deriveFn: () => T;
  #store: T | typeof EMPTY_CACHE = EMPTY_CACHE;
  constructor(deriver: D) {
    this.#orb = new Orb();
    this.#orb.intercept = () => {
      if (this.#store === EMPTY_CACHE) {
        return false;
      }
      this.#store = EMPTY_CACHE;
      this.#emitter?.emit();
      return true;
    };

    this.#deriveFn = orbCreateStaticFn(this.#orb, deriver) as () => T;
  }
  unwrap(): T {
    if (this.#store !== EMPTY_CACHE) {
      return this.#store;
    }
    this.#store = this.#deriveFn();
    return this.#store;
  }
  get [ORB]() {
    return this.#orb;
  }
  get [EMITTER]() {
    return (this.#emitter ??= new Emitter());
  }
  manage() {
    return orbManage(this.#orb);
  }
}

export const deriveStatic = <D extends StaticDeriver<unknown>>(deriver: D) =>
  new DeriveStaticAtom(deriver);

function mapDeriverRun<T, U>(this: {
  input: Atom<T>;
  mapFn: (input: T) => U;
}): U {
  return this.mapFn(this.input.unwrap());
}

function mapDeriverReg(this: { input: Atom<unknown> }, orb: Orb): undefined {
  orbLinkStatic(orb, this.input[ORB]);
}

export class MapAtom<T, U> implements Atom<U> {
  #emitter: Emitter | undefined;
  #orb!: Orb;
  #deriveFn: () => U;
  #store: U | typeof EMPTY_CACHE = EMPTY_CACHE;
  constructor(inputAtom: Atom<T>, mapFn: (input: T) => U) {
    this.#orb = new Orb();
    this.#orb.intercept = () => {
      if (this.#store === EMPTY_CACHE) {
        return false;
      }
      this.#store = EMPTY_CACHE;
      this.#emitter?.emit();
      return true;
    };

    this.#deriveFn = orbCreateStaticFn(this.#orb, {
      run: mapDeriverRun,
      registerSources: mapDeriverReg,
      input: inputAtom,
      mapFn,
    } as any);
  }
  unwrap(): U {
    if (this.#store !== EMPTY_CACHE) {
      return this.#store;
    }
    this.#store = this.#deriveFn();
    return this.#store;
  }
  get [ORB]() {
    return this.#orb;
  }
  get [EMITTER]() {
    return (this.#emitter ??= new Emitter());
  }
  manage() {
    return orbManage(this.#orb);
  }
}

export const map = <T, U>(inputAtom: Atom<T>, mapFn: (input: T) => U) =>
  new MapAtom(inputAtom, mapFn);

function atomUnwrap<T>(atom: Atom<T>): T {
  return atom.unwrap();
}

function mapManyDeriverRun<T extends Atom<unknown>[], U>(this: {
  inputs: Atom<unknown>[];
  mapFn: (inputs: ManyAtomValues<T>) => U;
}): U {
  return this.mapFn(this.inputs.map(atomUnwrap) as any);
}

function mapManyDeriverReg(
  this: { inputs: Atom<unknown>[] },
  orb: Orb
): undefined {
  for (const element of this.inputs) {
    orbLinkStatic(orb, element[ORB]);
  }
}

export class MapManyAtom<T extends Atom<unknown>[], U> implements Atom<U> {
  #emitter: Emitter | undefined;
  #orb!: Orb;
  #deriveFn: () => U;
  #store: U | typeof EMPTY_CACHE = EMPTY_CACHE;
  constructor(inputAtoms: T, mapFn: (inputs: ManyAtomValues<T>) => U) {
    this.#orb = new Orb();
    this.#orb.intercept = () => {
      if (this.#store === EMPTY_CACHE) {
        return false;
      }
      this.#store = EMPTY_CACHE;
      this.#emitter?.emit();
      return true;
    };

    this.#deriveFn = orbCreateStaticFn(this.#orb, {
      run: mapManyDeriverRun,
      registerSources: mapManyDeriverReg,
      inputs: inputAtoms,
      mapFn,
    } as any);
  }
  unwrap(): U {
    if (this.#store !== EMPTY_CACHE) {
      return this.#store;
    }
    this.#store = this.#deriveFn();
    return this.#store;
  }
  get [ORB]() {
    return this.#orb;
  }
  get [EMITTER]() {
    return (this.#emitter ??= new Emitter());
  }
  manage() {
    return orbManage(this.#orb);
  }
}

type ManyAtomValues<T extends Atom<unknown>[]> = {
  [K in keyof T]: T[K] extends Atom<infer V> ? V : never;
};

export const mapMany = <const T extends Atom<unknown>[], U>(
  inputAtoms: T,
  mapFn: (inputs: ManyAtomValues<T>) => U
) => new MapManyAtom(inputAtoms, mapFn);
