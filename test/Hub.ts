import { pipe } from "@effect/data/Function"
import * as ReadonlyArray from "@effect/data/ReadonlyArray"
import * as Deferred from "@effect/io/Deferred"
import * as Effect from "@effect/io/Effect"
import * as Fiber from "@effect/io/Fiber"
import * as Hub from "@effect/io/Hub"
import * as Queue from "@effect/io/Queue"
import * as it from "@effect/io/test/utils/extend"
import { assert, describe } from "vitest"

describe.concurrent("Hub", () => {
  it.effect("sequential publishers and subscribers with one publisher and one subscriber", () =>
    Effect.gen(function*($) {
      const values = ReadonlyArray.range(0, 9)
      const deferred1 = yield* $(Deferred.make<never, void>())
      const deferred2 = yield* $(Deferred.make<never, void>())
      const hub = yield* $(Hub.bounded<number>(10))
      const subscriber = yield* $(
        pipe(
          Hub.subscribe(hub),
          Effect.flatMap((subscription) =>
            pipe(
              Deferred.succeed(deferred1, void 0),
              Effect.zipRight(Deferred.await(deferred2)),
              Effect.zipRight(pipe(values, Effect.forEach(() => Queue.take(subscription))))
            )
          ),
          Effect.scoped,
          Effect.fork
        )
      )
      yield* $(Deferred.await(deferred1))
      yield* $(values, Effect.forEach((n) => Hub.publish(hub, n)))
      yield* $(Deferred.succeed(deferred2, void 0))
      const result = yield* $(Fiber.join(subscriber))
      assert.deepStrictEqual(result, values)
    }))
  it.effect("sequential publishers and subscribers with one publisher and two subscribers", () =>
    Effect.gen(function*($) {
      const values = ReadonlyArray.range(0, 9)
      const deferred1 = yield* $(Deferred.make<never, void>())
      const deferred2 = yield* $(Deferred.make<never, void>())
      const deferred3 = yield* $(Deferred.make<never, void>())
      const hub = yield* $(Hub.bounded<number>(10))
      const subscriber1 = yield* $(
        hub.pipe(
          Hub.subscribe,
          Effect.flatMap((subscription) =>
            pipe(
              Deferred.succeed(deferred1, void 0),
              Effect.zipRight(Deferred.await(deferred3)),
              Effect.zipRight(pipe(values, Effect.forEach(() => Queue.take(subscription))))
            )
          ),
          Effect.scoped,
          Effect.fork
        )
      )
      const subscriber2 = yield* $(
        hub.pipe(
          Hub.subscribe,
          Effect.flatMap((subscription) =>
            pipe(
              Deferred.succeed(deferred2, void 0),
              Effect.zipRight(Deferred.await(deferred3)),
              Effect.zipRight(pipe(values, Effect.forEach(() => Queue.take(subscription))))
            )
          ),
          Effect.scoped,
          Effect.fork
        )
      )
      yield* $(Deferred.await(deferred1))
      yield* $(Deferred.await(deferred2))
      yield* $(values, Effect.forEach((n) => Hub.publish(hub, n)))
      yield* $(Deferred.succeed(deferred3, undefined))
      const result1 = yield* $(Fiber.join(subscriber1))
      const result2 = yield* $(Fiber.join(subscriber2))
      assert.deepStrictEqual(result1, values)
      assert.deepStrictEqual(result2, values)
    }))
  it.effect("backpressured concurrent publishers and subscribers - one to one", () =>
    Effect.gen(function*($) {
      const values = ReadonlyArray.range(0, 64)
      const deferred = yield* $(Deferred.make<never, void>())
      const hub = yield* $(Hub.bounded<number>(64))
      const subscriber = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred, void 0),
            Effect.zipRight(pipe(values, Effect.forEach((_) => Queue.take(subscription))))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      yield* $(Deferred.await(deferred))
      yield* $(
        values,
        Effect.forEach((n) => Hub.publish(hub, n)),
        Effect.fork
      )
      const result = yield* $(Fiber.join(subscriber))
      assert.deepStrictEqual(result, values)
    }))
  it.effect("backpressured concurrent publishers and subscribers - one to many", () =>
    Effect.gen(function*($) {
      const values = ReadonlyArray.range(0, 64)
      const deferred1 = yield* $(Deferred.make<never, void>())
      const deferred2 = yield* $(Deferred.make<never, void>())
      const hub = yield* $(Hub.bounded<number>(64))
      const subscriber1 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred1, void 0),
            Effect.zipRight(pipe(values, Effect.forEach((_) => Queue.take(subscription))))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      const subscriber2 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred2, void 0),
            Effect.zipRight(pipe(values, Effect.forEach((_) => Queue.take(subscription))))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      yield* $(Deferred.await(deferred1))
      yield* $(Deferred.await(deferred2))
      yield* $(
        values,
        Effect.forEach((n) => Hub.publish(hub, n)),
        Effect.fork
      )
      const result1 = yield* $(Fiber.join(subscriber1))
      const result2 = yield* $(Fiber.join(subscriber2))
      assert.deepStrictEqual(result1, values)
      assert.deepStrictEqual(result2, values)
    }))
  it.effect("backpressured concurrent publishers and subscribers - many to many", () =>
    Effect.gen(function*($) {
      const values = ReadonlyArray.range(1, 64)
      const deferred1 = yield* $(Deferred.make<never, void>())
      const deferred2 = yield* $(Deferred.make<never, void>())
      const hub = yield* $(Hub.bounded<number>(64 * 2))
      const subscriber1 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred1, void 0),
            Effect.zipRight(pipe(
              values,
              ReadonlyArray.appendAll(values),
              Effect.forEach((_) => Queue.take(subscription))
            ))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      const subscriber2 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred2, void 0),
            Effect.zipRight(pipe(
              values,
              ReadonlyArray.appendAll(values),
              Effect.forEach((_) => Queue.take(subscription))
            ))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      yield* $(Deferred.await(deferred1))
      yield* $(Deferred.await(deferred2))
      const fiber = yield* $(
        values,
        Effect.forEach((n) => Hub.publish(hub, n)),
        Effect.fork
      )
      yield* $(values, ReadonlyArray.map((n) => -n), Effect.forEach((n) => Hub.publish(hub, n)), Effect.fork)
      const result1 = yield* $(Fiber.join(subscriber1))
      const result2 = yield* $(Fiber.join(subscriber2))
      yield* $(Fiber.join(fiber))
      assert.deepStrictEqual(pipe(result1, ReadonlyArray.filter((n) => n > 0)), values)
      assert.deepStrictEqual(
        pipe(result1, ReadonlyArray.filter((n) => n < 0)),
        pipe(values, ReadonlyArray.map((n) => -n))
      )
      assert.deepStrictEqual(pipe(result2, ReadonlyArray.filter((n) => n > 0)), values)
      assert.deepStrictEqual(
        pipe(result2, ReadonlyArray.filter((n) => n < 0)),
        pipe(values, ReadonlyArray.map((n) => -n))
      )
    }))
  it.effect("dropping concurrent publishers and subscribers - one to one", () =>
    Effect.gen(function*($) {
      const values = ReadonlyArray.range(0, 64)
      const deferred = yield* $(Deferred.make<never, void>())
      const hub = yield* $(Hub.dropping<number>(64))
      const subscriber = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred, void 0),
            Effect.zipRight(pipe(values, Effect.forEach((_) => Queue.take(subscription))))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      yield* $(Deferred.await(deferred))
      yield* $(
        values,
        Effect.forEach((n) => Hub.publish(hub, n)),
        Effect.fork
      )
      const result = yield* $(Fiber.join(subscriber))
      assert.deepStrictEqual(result, values)
    }))
  it.effect("dropping concurrent publishers and subscribers - one to many", () =>
    Effect.gen(function*($) {
      const values = ReadonlyArray.range(0, 64)
      const deferred1 = yield* $(Deferred.make<never, void>())
      const deferred2 = yield* $(Deferred.make<never, void>())
      const hub = yield* $(Hub.dropping<number>(64))
      const subscriber1 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred1, void 0),
            Effect.zipRight(pipe(values, Effect.forEach((_) => Queue.take(subscription))))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      const subscriber2 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred2, void 0),
            Effect.zipRight(pipe(values, Effect.forEach((_) => Queue.take(subscription))))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      yield* $(Deferred.await(deferred1))
      yield* $(Deferred.await(deferred2))
      yield* $(
        values,
        Effect.forEach((n) => Hub.publish(hub, n)),
        Effect.fork
      )
      const result1 = yield* $(Fiber.join(subscriber1))
      const result2 = yield* $(Fiber.join(subscriber2))
      assert.deepStrictEqual(result1, values)
      assert.deepStrictEqual(result2, values)
    }))
  it.effect("dropping concurrent publishers and subscribers - many to many", () =>
    Effect.gen(function*($) {
      const values = ReadonlyArray.range(1, 64)
      const deferred1 = yield* $(Deferred.make<never, void>())
      const deferred2 = yield* $(Deferred.make<never, void>())
      const hub = yield* $(Hub.dropping<number>(64 * 2))
      const subscriber1 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred1, void 0),
            Effect.zipRight(pipe(
              values,
              ReadonlyArray.appendAll(values),
              Effect.forEach((_) => Queue.take(subscription))
            ))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      const subscriber2 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred2, void 0),
            Effect.zipRight(pipe(
              values,
              ReadonlyArray.appendAll(values),
              Effect.forEach((_) => Queue.take(subscription))
            ))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      yield* $(Deferred.await(deferred1))
      yield* $(Deferred.await(deferred2))
      const fiber = yield* $(
        values,
        Effect.forEach((n) => Hub.publish(hub, n)),
        Effect.fork
      )
      yield* $(values, ReadonlyArray.map((n) => -n), Effect.forEach((n) => Hub.publish(hub, n)), Effect.fork)
      const result1 = yield* $(Fiber.join(subscriber1))
      const result2 = yield* $(Fiber.join(subscriber2))
      yield* $(Fiber.join(fiber))
      assert.deepStrictEqual(pipe(result1, ReadonlyArray.filter((n) => n > 0)), values)
      assert.deepStrictEqual(
        pipe(result1, ReadonlyArray.filter((n) => n < 0)),
        pipe(values, ReadonlyArray.map((n) => -n))
      )
      assert.deepStrictEqual(pipe(result2, ReadonlyArray.filter((n) => n > 0)), values)
      assert.deepStrictEqual(
        pipe(result2, ReadonlyArray.filter((n) => n < 0)),
        pipe(values, ReadonlyArray.map((n) => -n))
      )
    }))
  it.effect("sliding concurrent publishers and subscribers - one to one", () =>
    Effect.gen(function*($) {
      const values = ReadonlyArray.range(0, 64)
      const deferred = yield* $(Deferred.make<never, void>())
      const hub = yield* $(Hub.sliding<number>(64))
      const subscriber = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred, void 0),
            Effect.zipRight(pipe(values, Effect.forEach((_) => Queue.take(subscription))))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      yield* $(Deferred.await(deferred))
      yield* $(
        values,
        Effect.forEach((n) => Hub.publish(hub, n)),
        Effect.fork
      )
      const result = yield* $(Fiber.join(subscriber))
      assert.deepStrictEqual(result, values)
    }))
  it.effect("sliding concurrent publishers and subscribers - one to many", () =>
    Effect.gen(function*($) {
      const values = ReadonlyArray.range(0, 64)
      const deferred1 = yield* $(Deferred.make<never, void>())
      const deferred2 = yield* $(Deferred.make<never, void>())
      const hub = yield* $(Hub.sliding<number>(64))
      const subscriber1 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred1, void 0),
            Effect.zipRight(pipe(values, Effect.forEach((_) => Queue.take(subscription))))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      const subscriber2 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred2, void 0),
            Effect.zipRight(pipe(values, Effect.forEach((_) => Queue.take(subscription))))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      yield* $(Deferred.await(deferred1))
      yield* $(Deferred.await(deferred2))
      yield* $(
        values,
        Effect.forEach((n) => Hub.publish(hub, n)),
        Effect.fork
      )
      const result1 = yield* $(Fiber.join(subscriber1))
      const result2 = yield* $(Fiber.join(subscriber2))
      assert.deepStrictEqual(result1, values)
      assert.deepStrictEqual(result2, values)
    }))
  it.effect("sliding concurrent publishers and subscribers - many to many", () =>
    Effect.gen(function*($) {
      const values = ReadonlyArray.range(1, 64)
      const deferred1 = yield* $(Deferred.make<never, void>())
      const deferred2 = yield* $(Deferred.make<never, void>())
      const hub = yield* $(Hub.sliding<number>(64 * 2))
      const subscriber1 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred1, void 0),
            Effect.zipRight(pipe(
              values,
              ReadonlyArray.appendAll(values),
              Effect.forEach((_) => Queue.take(subscription))
            ))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      const subscriber2 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred2, void 0),
            Effect.zipRight(pipe(
              values,
              ReadonlyArray.appendAll(values),
              Effect.forEach((_) => Queue.take(subscription))
            ))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      yield* $(Deferred.await(deferred1))
      yield* $(Deferred.await(deferred2))
      const fiber = yield* $(
        values,
        Effect.forEach((n) => Hub.publish(hub, n)),
        Effect.fork
      )
      yield* $(values, ReadonlyArray.map((n) => -n), Effect.forEach((n) => Hub.publish(hub, n)), Effect.fork)
      const result1 = yield* $(Fiber.join(subscriber1))
      const result2 = yield* $(Fiber.join(subscriber2))
      yield* $(Fiber.join(fiber))
      assert.deepStrictEqual(pipe(result1, ReadonlyArray.filter((n) => n > 0)), values)
      assert.deepStrictEqual(
        pipe(result1, ReadonlyArray.filter((n) => n < 0)),
        pipe(values, ReadonlyArray.map((n) => -n))
      )
      assert.deepStrictEqual(pipe(result2, ReadonlyArray.filter((n) => n > 0)), values)
      assert.deepStrictEqual(
        pipe(result2, ReadonlyArray.filter((n) => n < 0)),
        pipe(values, ReadonlyArray.map((n) => -n))
      )
    }))
  it.effect("unbounded concurrent publishers and subscribers - one to one", () =>
    Effect.gen(function*($) {
      const values = ReadonlyArray.range(0, 64)
      const deferred = yield* $(Deferred.make<never, void>())
      const hub = yield* $(Hub.unbounded<number>())
      const subscriber = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred, void 0),
            Effect.zipRight(pipe(values, Effect.forEach((_) => Queue.take(subscription))))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      yield* $(Deferred.await(deferred))
      yield* $(
        values,
        Effect.forEach((n) => Hub.publish(hub, n)),
        Effect.fork
      )

      const result = yield* $(Fiber.join(subscriber))
      assert.deepStrictEqual(result, values)
    }))
  it.effect("unbounded concurrent publishers and subscribers - one to many", () =>
    Effect.gen(function*($) {
      const values = ReadonlyArray.range(0, 64)
      const deferred1 = yield* $(Deferred.make<never, void>())
      const deferred2 = yield* $(Deferred.make<never, void>())
      const hub = yield* $(Hub.unbounded<number>())
      const subscriber1 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred1, void 0),
            Effect.zipRight(pipe(values, Effect.forEach((_) => Queue.take(subscription))))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      const subscriber2 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred2, void 0),
            Effect.zipRight(pipe(values, Effect.forEach((_) => Queue.take(subscription))))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      yield* $(Deferred.await(deferred1))
      yield* $(Deferred.await(deferred2))
      yield* $(
        values,
        Effect.forEach((n) => Hub.publish(hub, n)),
        Effect.fork
      )
      const result1 = yield* $(Fiber.join(subscriber1))
      const result2 = yield* $(Fiber.join(subscriber2))
      assert.deepStrictEqual(result1, values)
      assert.deepStrictEqual(result2, values)
    }))
  it.effect("unbounded concurrent publishers and subscribers - many to many", () =>
    Effect.gen(function*($) {
      const values = ReadonlyArray.range(1, 64)
      const deferred1 = yield* $(Deferred.make<never, void>())
      const deferred2 = yield* $(Deferred.make<never, void>())
      const hub = yield* $(Hub.unbounded<number>())
      const subscriber1 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred1, void 0),
            Effect.zipRight(pipe(
              values,
              ReadonlyArray.appendAll(values),
              Effect.forEach((_) => Queue.take(subscription))
            ))
          )
        ),
        Effect.scoped,
        Effect.fork
      )

      const subscriber2 = yield* $(
        Hub.subscribe(hub),
        Effect.flatMap((subscription) =>
          pipe(
            Deferred.succeed(deferred2, void 0),
            Effect.zipRight(pipe(
              values,
              ReadonlyArray.appendAll(values),
              Effect.forEach((_) => Queue.take(subscription))
            ))
          )
        ),
        Effect.scoped,
        Effect.fork
      )
      yield* $(Deferred.await(deferred1))
      yield* $(Deferred.await(deferred2))
      const fiber = yield* $(
        values,
        Effect.forEach((n) => Hub.publish(hub, n)),
        Effect.fork
      )
      yield* $(values, ReadonlyArray.map((n) => -n), Effect.forEach((n) => Hub.publish(hub, n)), Effect.fork)
      const result1 = yield* $(Fiber.join(subscriber1))
      const result2 = yield* $(Fiber.join(subscriber2))
      yield* $(Fiber.join(fiber))
      assert.deepStrictEqual(ReadonlyArray.filter(result1, (n) => n > 0), values)
      assert.deepStrictEqual(
        ReadonlyArray.filter(result1, (n) => n < 0),
        ReadonlyArray.map(values, (n) => -n)
      )
      assert.deepStrictEqual(ReadonlyArray.filter(result2, (n) => n > 0), values)
      assert.deepStrictEqual(
        ReadonlyArray.filter(result2, (n) => n < 0),
        ReadonlyArray.map(values, (n) => -n)
      )
    }))
})
