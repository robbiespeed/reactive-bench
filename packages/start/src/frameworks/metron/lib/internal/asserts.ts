import { ExpiredReadError } from '../shared.js';

export function bindableAssertActive(this: { receiver: unknown }) {
  if (this.receiver === undefined) {
    throw new ExpiredReadError();
  }
}
