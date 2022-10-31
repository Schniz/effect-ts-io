import * as internal from "@effect/io/internal/stm"
import * as Entry from "@effect/io/internal/stm/entry"
import type * as Journal from "@effect/io/internal/stm/journal"
import type * as TxnId from "@effect/io/internal/stm/txnId"
import * as Versioned from "@effect/io/internal/stm/versioned"
import type * as STM from "@effect/io/STM"
import type * as Ref from "@effect/io/STM/Ref"
import { pipe } from "@fp-ts/data/Function"
import * as Option from "@fp-ts/data/Option"

/** @internal */
export const RefTypeId: Ref.RefTypeId = Symbol.for("@effect/io/Ref") as Ref.RefTypeId

/** @internal */
const refVariance = {
  _A: (_: never) => _
}

export class RefImpl<A> implements Ref.Ref<A> {
  readonly [RefTypeId] = refVariance
  /** @internal */
  todos: Map<TxnId.TxnId, Journal.Todo>
  /** @internal */
  versioned: Versioned.Versioned<A>
  constructor(value: A) {
    this.versioned = new Versioned.Versioned(value)
    this.todos = new Map()
  }
  modify<B>(f: (a: A) => readonly [B, A]): STM.STM<never, never, B> {
    return internal.effect((journal) => {
      const entry = getOrMakeEntry(this, journal)
      const [retValue, newValue] = f(Entry.unsafeGet(entry) as A)
      Entry.unsafeSet(entry, newValue)
      return retValue
    })
  }
}

/** @internal */
export const make = <A>(evaluate: () => A): STM.STM<never, never, Ref.Ref<A>> => {
  return internal.effect((journal) => {
    const value = evaluate()
    const ref = new RefImpl(value)
    journal.set(ref, Entry.make(ref, true))
    return ref
  })
}

/** @internal */
export const get = <A>(self: Ref.Ref<A>) => self.modify((a) => [a, a])

/** @internal */
export const set = <A>(value: A) => (self: Ref.Ref<A>) => self.modify((): [void, A] => [void 0, value])

/** @internal */
export const getAndSet = <A>(value: A) => (self: Ref.Ref<A>) => self.modify((a): [A, A] => [a, value])

/** @internal */
export const getAndUpdate = <A>(f: (a: A) => A) => (self: Ref.Ref<A>) => self.modify((a): [A, A] => [a, f(a)])

/** @internal */
export const getAndUpdateSome = <A>(f: (a: A) => Option.Option<A>) =>
  (self: Ref.Ref<A>) =>
    self.modify((a): [A, A] =>
      pipe(
        f(a),
        Option.match(() => [a, a], (b) => [a, b])
      )
    )

/** @internal */
export const setAndGet = <A>(value: A) => (self: Ref.Ref<A>) => self.modify((): [A, A] => [value, value])

/** @internal */
export const modify = <A, B>(f: (a: A) => readonly [B, A]) => (self: Ref.Ref<A>) => self.modify(f)

/** @internal */
export const modifySome = <A, B>(fallback: B, f: (a: A) => Option.Option<readonly [B, A]>) =>
  (self: Ref.Ref<A>) =>
    self.modify((a) =>
      pipe(
        f(a),
        Option.match(
          () => [fallback, a],
          (b) => b
        )
      )
    )

/** @internal */
export const update = <A>(f: (a: A) => A) => (self: Ref.Ref<A>) => self.modify((a): [void, A] => [void 0, f(a)])

/** @internal */
export const updateAndGet = <A>(f: (a: A) => A) =>
  (self: Ref.Ref<A>) =>
    self.modify((a): [A, A] => {
      const b = f(a)
      return [b, b]
    })

/** @internal */
export const updateSome = <A>(f: (a: A) => Option.Option<A>) =>
  (self: Ref.Ref<A>) => self.modify((a): [void, A] => [void 0, pipe(f(a), Option.match(() => a, (b) => b))])

/** @internal */
export const updateSomeAndGet = <A>(f: (a: A) => Option.Option<A>) =>
  (self: Ref.Ref<A>) => self.modify((a): [A, A] => pipe(f(a), Option.match(() => [a, a], (b) => [b, b])))

/** @internal */
const getOrMakeEntry = <A>(self: Ref.Ref<A>, journal: Journal.Journal): Entry.Entry => {
  if (journal.has(self)) {
    return journal.get(self)!
  }
  const entry = Entry.make(self, false)
  journal.set(self, entry)
  return entry
}
