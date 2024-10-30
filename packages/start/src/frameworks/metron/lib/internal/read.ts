import { ORB, type Atom } from '../atom.js';
import { type Orb } from '../orb.js';
import { ExpiredReadError } from '../shared.js';

export function bindableRead<T>(this: Orb<unknown>, atom: Atom<T>): T {
  atom[ORB].linkReceiver(this);
  return atom.unwrap();
}

export function unexpectedRead(atom: Atom<unknown>): never {
  throw new Error('Unexpected read');
}

// TODO benchmark making this a class w #receiver and bindable read a arrow fn
export function bindableEphemeralRead<T>(
  this: { receiver: Orb<unknown> },
  atom: Atom<T>
): T {
  const { receiver } = this;
  if (receiver === undefined) {
    throw new ExpiredReadError();
  }
  atom[ORB].linkReceiver(receiver);
  return atom.unwrap();
}
