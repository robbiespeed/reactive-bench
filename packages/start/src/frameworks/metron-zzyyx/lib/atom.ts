import { EmitController, EMITTER } from "#lib/frameworks/metron-o/lib/emitter";
import { ORB, OrbController, OrbStaticController } from "./orb.js";
import { EMPTY_CACHE, type Atom, type Reader } from "./shared.js";

export class StateAtom<T> implements Atom<T> {
  #emitController: EmitController | undefined;
  #orbController: OrbController | undefined;
  #store: T;
  constructor(initialValue: T) {
    this.#store = initialValue;
  }
  set(value: T): undefined {
    if (value === this.#store) {
      return;
    }
    this.#store = value;
    this.#emitController?.emit();
    this.#orbController?.transmit();
  }
  unwrap(): T {
    return this.#store;
  }
  get [ORB]() {
    return (this.#orbController ??= new OrbController()).orb;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
}

export const state = <T>(initialValue: T) => new StateAtom(initialValue);

export class DeriveAtom<T> implements Atom<T> {
  #emitController: EmitController | undefined;
  #orbController!: OrbController;
  #deriveFn: (read: Reader) => T;
  #store: T | typeof EMPTY_CACHE = EMPTY_CACHE;
  constructor(derivation: (read: Reader) => T) {
    this.#orbController = new OrbController();
    this.#orbController.setIntercept(() => {
      if (this.#store === EMPTY_CACHE) {
        return false;
      }
      this.#store = EMPTY_CACHE;
      this.#emitController?.emit();
      return true;
    });
    this.#deriveFn = derivation;
  }
  unwrap(): T {
    if (this.#store !== EMPTY_CACHE) {
      return this.#store;
    }
    this.#store = this.#orbController.receive(this.#deriveFn);
    return this.#store;
  }
  get [ORB]() {
    return this.#orbController.orb;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
  manage() {
    return this.#orbController.manage();
  }
}

export const derive = <T>(derivation: (read: Reader) => T) =>
  new DeriveAtom(derivation);

export class MapAtom<T, U> implements Atom<U> {
  #emitController: EmitController | undefined;
  #orbController!: OrbStaticController;
  #inputAtom: Atom<T>;
  #mapFn: (input: T) => U;
  #store: U | typeof EMPTY_CACHE = EMPTY_CACHE;
  constructor(inputAtom: Atom<T>, mapFn: (input: T) => U) {
    this.#inputAtom = inputAtom;
    this.#orbController = new OrbStaticController();
    this.#orbController.setIntercept(() => {
      if (this.#store === EMPTY_CACHE) {
        return false;
      }
      this.#store = EMPTY_CACHE;
      this.#emitController?.emit();
      return true;
    });
    this.#orbController.link(inputAtom[ORB]);
    this.#mapFn = mapFn;
  }
  unwrap(): U {
    if (this.#store !== EMPTY_CACHE) {
      return this.#store;
    }
    if (this.#orbController.checkEmptyReceiver()) {
      this.#orbController.link(this.#inputAtom[ORB]);
    }
    this.#store = this.#mapFn(this.#inputAtom.unwrap());
    return this.#store;
  }
  get [ORB]() {
    return this.#orbController.orb;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
  manage() {
    return this.#orbController.manage();
  }
}

export const map = <T, U>(inputAtom: Atom<T>, mapFn: (input: T) => U) =>
  new MapAtom(inputAtom, mapFn);

function atomUnwrap<T>(atom: Atom<T>): T {
  return atom.unwrap();
}

export class MapManyAtom<T extends Atom<unknown>[], U> implements Atom<U> {
  #emitController: EmitController | undefined;
  #orbController!: OrbStaticController;
  #inputAtoms: T;
  #mapFn: (inputs: ManyAtomValues<T>) => U;
  #store: U | typeof EMPTY_CACHE = EMPTY_CACHE;
  constructor(inputAtoms: T, mapFn: (inputs: ManyAtomValues<T>) => U) {
    this.#inputAtoms = inputAtoms;
    this.#orbController = new OrbStaticController();
    this.#orbController.setIntercept(() => {
      if (this.#store === EMPTY_CACHE) {
        return false;
      }
      this.#store = EMPTY_CACHE;
      this.#emitController?.emit();
      return true;
    });
    for (const atom of inputAtoms) {
      this.#orbController.link(atom[ORB]);
    }
    this.#mapFn = mapFn;
  }
  unwrap(): U {
    if (this.#store !== EMPTY_CACHE) {
      return this.#store;
    }
    if (this.#orbController.checkEmptyReceiver()) {
      for (const atom of this.#inputAtoms) {
        this.#orbController.link(atom[ORB]);
      }
    }
    this.#store = this.#mapFn(this.#inputAtoms.map(atomUnwrap) as any);
    return this.#store;
  }
  get [ORB]() {
    return this.#orbController.orb;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
  manage() {
    return this.#orbController.manage();
  }
}

type ManyAtomValues<T extends Atom<unknown>[]> = {
  [K in keyof T]: T[K] extends Atom<infer V> ? V : never;
};

export const mapMany = <const T extends Atom<unknown>[], U>(
  inputAtoms: T,
  mapFn: (inputs: ManyAtomValues<T>) => U
) => new MapManyAtom(inputAtoms, mapFn);
