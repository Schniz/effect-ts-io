import * as Effect from "@effect/io/Effect"
import * as Ref from "@effect/io/Ref"
import type * as Scope from "@effect/io/Scope"
import { pipe } from "@fp-ts/data/Function"

interface Counter {
  acquire(): Effect.Effect<Scope.Scope, never, number>
  incrementAcquire(): Effect.Effect<never, never, number>
  incrementRelease(): Effect.Effect<never, never, number>
  acquired(): Effect.Effect<never, never, number>
  released(): Effect.Effect<never, never, number>
}

class CounterImpl implements Counter {
  constructor(readonly ref: Ref.Ref<readonly [number, number]>) {}

  acquire(): Effect.Effect<Scope.Scope, never, number> {
    return pipe(
      this.incrementAcquire(),
      Effect.zipRight(Effect.addFinalizer(() => this.incrementRelease())),
      Effect.zipRight(this.acquired()),
      Effect.uninterruptible
    )
  }

  incrementAcquire(): Effect.Effect<never, never, number> {
    return pipe(
      this.ref,
      Ref.modify(([acquire, release]) => [acquire + 1, [acquire + 1, release] as const] as const)
    )
  }

  incrementRelease(): Effect.Effect<never, never, number> {
    return pipe(
      this.ref,
      Ref.modify(([acquire, release]) => [release + 1, [acquire, release + 1] as const] as const)
    )
  }

  acquired(): Effect.Effect<never, never, number> {
    return pipe(
      Ref.get(this.ref),
      Effect.map((tuple) => tuple[0])
    )
  }

  released(): Effect.Effect<never, never, number> {
    return pipe(
      Ref.get(this.ref),
      Effect.map((tuple) => tuple[1])
    )
  }
}

export const make = (): Effect.Effect<never, never, Counter> => {
  return pipe(
    Ref.make([0, 0] as const),
    Effect.map((ref) => new CounterImpl(ref))
  )
}