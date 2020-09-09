// Requires: [Typescript 4.0]
// Supports: [Deno]

// A library of compile-time and run-time utilities by Callionica

/** A type that can be either an asynchronous or a synchronous iterable (such as an array or a generator) */
export type AnyIterable<T> = AsyncIterable<T> | Iterable<T>;

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
    // deno-lint-ignore no-explicit-any
    return ((value as any)[Symbol.asyncIterator] != undefined);
}

/** Converts an iterator or iterable into its value type */
export type InferIteratorValue<T> =
    T extends Iterable<infer V0> ? V0 :
    T extends Iterator<infer V1> ? V1 :
    T extends AsyncIterable<infer V2> ? V2 :
    T extends AsyncIterator<infer V3> ? V3 :
    never;

/** Type literal `0` */
type Zero = 0;

/** The number of elements in a tuple type */
type Length<T extends unknown[]> = T['length'];

/** The first type in a tuple type */
type Head<T extends unknown[]> = T extends [unknown, ...unknown[]] ? T[0] : never;

/** All types except the first type in a tuple type */
type Tail<T extends unknown[]> =
    // deno-lint-ignore no-explicit-any
    ((...t: T) => unknown) extends ((t: any, ...tail: infer V0) => unknown) ?
    V0 :
    never;

/** Adds a new type to the head of a tuple type */
type Prepend<E, T extends unknown[]> =
    ((head: E, ...args: T) => unknown) extends ((...args: infer V0) => unknown) ?
    V0 :
    T;

/** Reverses the types in a tuple type */
type Reverse<T extends unknown[], Result extends unknown[] = []> = {
    0: Reverse<Tail<T>, Prepend<Head<T>, Result>>,
    1: Result
}[Length<T> extends Zero ? 1 : 0];

/**
 * `Zip` takes in a list of iterator/iterable types
 * and returns a list of value types made optional
 * 
 * This type is used by the `zip` function.
 * 
 * The types are `X | undefined` because `zip` does not stop at
 * the shortest sequence.
 * 
 * `zip` is equivalent to Python's `zip_longest` with a `fillvalue` of `undefined`.
 */
type Zip<T extends unknown[], Result extends unknown[] = []> = {
    0: Zip<Tail<T>, Prepend<(InferIteratorValue<Head<T>> | undefined), Result>>,
    1: Reverse<Result>
}[Length<T> extends Zero ? 1 : 0];

/** Returns the result of calling `Symbol.asyncIterator` or `Symbol.iterator` method */
function getIterator<T>(iterable: AnyIterable<T>) {
    return (iterable as AsyncIterable<T>)[Symbol.asyncIterator]?.() || (iterable as Iterable<T>)[Symbol.iterator]?.();
}

/** Implementation of the `zip` function accounting for TS compiler limitations */
async function* _zip<T extends AnyIterable<unknown>[]>(...iterables: T) {
    let iterators = iterables.map(getIterator);
    let its = (await Promise.all(iterators)).map(it => ({ done: false, iterator: it }));
    let remaining = its.length;
    while (true) {
        let result = [];
        for (let it of its) {
            if (it.done) {
                result.push(undefined);
            } else {
                let current = await it.iterator.next();
                if (current.done) {
                    it.done = true;
                    --remaining;
                }
                result.push(current.value);
            }
        }
        if (remaining) {
            yield result;
        } else {
            return;
        }
    }
}

/**
 * Use `zip` if you have multiple lists and you want a new list where
 * the Nth item in the new list is the collection of the Nth items from 
 * each of the original lists.
 * 
 * If any of the lists is shorter than the longest list, `undefined` is used
 * to represent the missing values from that list.
 * 
 * Because the function allows both synchronous and asynchronous iterables as input,
 * the result is an asynchronous iterable, which you can iterate over using
 * `for await ( ... of ... )`.
 * 
 * `zip` is comparable to Python's `zip_longest` with a `fillvalue` of `undefined`.
 * 
 * @param iterables AsyncIterable or Iterable objects whose values you wish to zip
 */
export function zip<T extends AnyIterable<unknown>[]>(...iterables: T): AsyncIterable<Zip<T>> {
    // This wrapper is to work around what looks like a TS compiler bug
    return (_zip(...iterables) as unknown) as AsyncIterable<Zip<T>>;
}

/**
 * Returns a new async iterable that pulls from the provided iterable
 * up to a maximum number of items.
 * 
 * @param iterable An iterable to be length-limited
 * @param length The maximum number of items that can be obtained from the new iterable
 */
export async function* limit<T>(iterable: AnyIterable<T>, length: number): AsyncIterable<T> {
    let yielded = 0;
    for await (let value of iterable) {
        yield value;
        ++yielded;
        if (yielded >= length) {
            return;
        }
    }
}

/**
 * Expands an asynchronous iterable to produce an array of its values
 * (similar to `[...iterable]` for synchronous iterables).
*/
export async function expand<T>(iterable: AnyIterable<T>) {
    const result: T[] = [];
    for await (let value of iterable) {
        result.push(value);
    }
    return result;
}