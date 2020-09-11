// Requires: [Typescript 4.0]
// Supports: [Deno]

// A library of compile-time and run-time utilities by Callionica

/** A type that can be either an asynchronous or a synchronous iterable (such as an array or a generator) */
export type AnyIterable<T> = AsyncIterable<T> | Iterable<T>;

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
    // deno-lint-ignore no-explicit-any
    return ((value as any)[Symbol.asyncIterator] != undefined);
}

/** Converts an iterable or iterator into its value type */
export type ValueOfIterable<T> =
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
    ((_: E, ...args: T) => unknown) extends ((...args: infer V0) => unknown) ?
    V0 :
    T;

/** Reverses the types in a tuple type */
type Reverse<Input extends unknown[], Result extends unknown[] = []> = {
    'Continue': Reverse<Tail<Input>, Prepend<Head<Input>, Result>>,
    'Return': Result
}[Length<Input> extends Zero ? 'Return' : 'Continue'];

/**
 * Takes in a list of iterable types
 * and returns a list of value types.
 */ 
type ValuesOfIterables<Input extends unknown[], Result extends unknown[] = []> = {
    'Continue': ValuesOfIterables<Tail<Input>, Prepend<(ValueOfIterable<Head<Input>>), Result>>,
    'Return': Reverse<Result>
}[Length<Input> extends Zero ? 'Return' : 'Continue'];

/**
 * Takes in a list of iterable types
 * and returns a list of value types made optional.
 * 
 * This type is used by the `zip` function.
 * 
 * The types are `T | undefined` because `zip` continues returning values
 * until the longest sequence is consumed, so uses `undefined` to represent
 * missing values in the shorter sequences.
 * 
 * `zip` is equivalent to Python's `zip_longest` with a `fillvalue` of `undefined`.
 */
type ZipResult<Input extends unknown[]> = Partial<ValuesOfIterables<Input>>;

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
export function zip<T extends AnyIterable<unknown>[]>(...iterables: T): AsyncIterable<ZipResult<T>> {
    // This wrapper is to work around what looks like a TS compiler bug
    return (_zip(...iterables) as unknown) as AsyncIterable<ValuesOfIterables<T>>;
}

/**
 * Returns a new async iterable that pulls a segment from the provided iterable.
 * 
 * @param iterable Any kind of iterable.
 * @param start The beginning of the specified segment.
 * @param end The end of the specified segment. This is exclusive of the element at the index 'end'.
 */
export async function* slice<T>(iterable: AnyIterable<T>, start?: number, end?: number): AsyncIterable<T> {
    const theStart = start || 0;
    const theEnd = end || Infinity;
    let index = 0;
    for await (let value of iterable) {
        if (index >= theEnd) {
            return;
        }

        if (index >= theStart) {
            yield value;
        }

        ++index;
    }
}

/**
 * Expands an asynchronous iterable to produce an array of its values
 * (similar to `[...iterable]` or `Array.from(iterable)` for synchronous iterables).
 * Also works with synchronous iterables.
*/
export async function arrayFrom<T>(iterable: AnyIterable<T>) {
    const result: T[] = [];
    for await (let value of iterable) {
        result.push(value);
    }
    return result;
}