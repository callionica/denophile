// Requires: [Typescript 4.0]
// Supports: [Deno]

// A library of compile-time and run-time utilities by Callionica

/** A type that can be either an asynchronous or a synchronous iterable (such as an array or a generator) */
export type AnyIterable<T> = AsyncIterable<T> | Iterable<T>;

/** A type that can be either an asynchronous or a synchronous generator */
export type AnyGenerator<T> = AsyncGenerator<T> | Generator<T>;

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
    // deno-lint-ignore no-explicit-any
    return ((value as any)[Symbol.asyncIterator] != undefined);
}

function toAsyncIterable<T>(iterable: AnyIterable<T>): AsyncIterable<T> {
    if (isAsyncIterable(iterable)) {
        return iterable;
    }

    async function* _toAsyncIterable(iterable: Iterable<T>) {
        for (const item of iterable) {
            yield item;
        }
    }

    return generable(_toAsyncIterable)(iterable);
}

/**
 * Converts a generator function to a function that returns a repeatable iterable.
 * 
 * Although Javascript generator functions behave as if they return iterables,
 * the iterable they return can only be used once (it's really an iterator).
 * 
 * Use this function to create a new function that returns real, reusable iterables.
 * 
 * @param generator A generator function
 */
export function generable<Args extends unknown[], Result>(generator: (...t: Args) => AsyncGenerator<Result>): (...t: Args) => AsyncIterable<Result> {
    // Javascript generators are not iterables (although they can be used that way ONCE!)
    // Javascript generators are iterators.
    // To create a real, reusable iterable, we need to capture the function that returns
    // the generator and call that function each time the iterator is obtained.
    return (...args) => {
        return {
            repeatable: true,
            [Symbol.asyncIterator]: () => { return generator(...args); }
        };
    };
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
 * Any property of type T can be its original type or type V
 */
type Mix<T, V> = {
    [P in keyof T]: T[P] | V;
};

/**
 * Takes in a list of iterable types
 * and returns a list of value types (or the fill value type).
 * 
 * This type is used by the `zip` function.
 * 
 * The types from the iterables are mixed with the fill value type because `zip`
 * continues returning values until the longest sequence is consumed, so there is potentially
 * another type to represent missing values in the shorter sequences.
 * 
 * `zip` is equivalent to Python's `zip_longest`.
 */
type ZipResult<Input extends unknown[], Value = undefined> = Mix<ValuesOfIterables<Input>, Value>;

/** Returns the result of calling `Symbol.asyncIterator` or `Symbol.iterator` method */
function getIterator<T>(iterable: AnyIterable<T>) {
    return (iterable as AsyncIterable<T>)[Symbol.asyncIterator]?.() || (iterable as Iterable<T>)[Symbol.iterator]?.();
}

/** Implementation of the `zip` function accounting for TS compiler limitations */
async function* __zip<Iterables extends AnyIterable<unknown>[], Value>(fillValue: Value, ...iterables: Iterables) {
    let iterators = iterables.map(getIterator);
    let its = (await Promise.all(iterators)).map(it => ({ done: false, iterator: it }));
    let remaining = its.length;
    while (true) {
        let result = [];
        for (let it of its) {
            if (it.done) {
                result.push(fillValue);
            } else {
                let current = await it.iterator.next();
                if (current.done) {
                    it.done = true;
                    --remaining;
                    result.push(fillValue);
                } else {
                    result.push(current.value);
                }
            }
        }
        if (remaining) {
            yield result;
        } else {
            return;
        }
    }
}

const _zip = generable(__zip);

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
 * `zip` is comparable to Python's `zip_longest`.
 * 
 * @param args AsyncIterable or Iterable objects whose values you wish to zip
 */
export function zip<Iterables extends AnyIterable<unknown>[], Value>(...args: [...Iterables, { fillValue: Value }]): AsyncIterable<ZipResult<Iterables, Value>> {
    // This wrapper is to work around what looks like a TS compiler bug
    const options = args[args.length - 1] as { fillValue: Value };
    const iterables = args.slice(0, args.length - 1) as [...Iterables];
    return (_zip(options.fillValue, ...iterables) as unknown) as AsyncIterable<ZipResult<Iterables, Value>>;
}

/**
 * Returns a new async iterable that pulls a segment from the provided iterable.
 * 
 * @param iterable Any kind of iterable.
 * @param start The beginning of the specified segment.
 * @param end The end of the specified segment. This is exclusive of the element at the index 'end'.
 */
export function slice<T>(iterable: AnyIterable<T>, start?: number, end?: number): AsyncIterable<T> {
    const theStart = start || 0;
    const theEnd = end || Infinity;

    async function* _slice() {
        let index = 0;
        for await (let item of iterable) {
            if (index >= theEnd) {
                return;
            }

            if (index >= theStart) {
                yield item;
            }

            ++index;
        }
    }

    return generable(_slice)();
}

/**
 * Expands an asynchronous iterable to produce an array of its values
 * (similar to `[...iterable]` or `Array.from(iterable)` for synchronous iterables).
 * Also works with synchronous iterables.
*/
export async function arrayFrom<T>(iterable: AnyIterable<T>) {
    const result: T[] = [];
    for await (let item of iterable) {
        result.push(item);
    }
    return result;
}

/**
 * If the iterable has a non-zero `length` property, returns the value of the `length` property.
 * Otherwise iterates through the list and counts the values in the list.
 * This is potentially an expensive operation!
 * 
 * @param iterable The list from which to obtain the length
 */
export async function length<T>(iterable: AnyIterable<T>): Promise<number> {
    // deno-lint-ignore no-explicit-any
    let length: number = (iterable as any)?.length || 0;
    if (length > 0) {
        return length;
    }

    for await (const item of iterable) {
        ++length;
    }

    return length;
}

/**
 * Returns a value derived from the first item in the collection that matches a provided test.
 * 
 * Like Array.some except this function doesn't just return a boolean.
 * Like Array.find except this functon doesn't just return exactly the found item.
 * 
 * @param iterable A collection of items
 * @param testAndMap A function that returns a relevant value when the provided item matches some criteria (and otherwise returns undefined).
 */
export async function first<Item, Result>(iterable: AnyIterable<Item>, testAndMap: (item: Item) => (Result | undefined)): Promise<Result | undefined> {
    let result: Result | undefined;
    for await (let item of iterable) {
        if (undefined !== (result = testAndMap(item))) {
            break;
        }
    }
    return result;
}

/**
 * Returns a new list consisting of the original list's values interspersed with filler
 * values so that the new list has more items than the original.
 * 
 * The function works with iterables so it is lazy, but it requires the caller to already
 * know the number of items in the original list which must be stable for the function to work.
 * 
 * @param iterable The list of values to be spread out
 * @param iterableLength The current number of values in the list
 * @param newLength The desired length of the new list
 * @param filler The value used to spread out the list to the desired length
 */
export function spread<Item, Filler>(
    iterable: AnyIterable<Item>,
    iterableLength: number,
    options: {
        newLength: number,
        fillValue: Filler
    }
): AsyncIterable<Item | Filler> {
    const fillerLength = options.newLength - iterableLength;
    if (fillerLength < 0) {
        throw "spread can only extend length";
    }

    async function* _spread() {
        let fillerCount = 0;
        let valueCount = 0;

        for await (const item of iterable) {
            yield item;
            ++valueCount;

            // We want to start and end with a real value
            // so we always produce a real value first then,
            // to determine whether to produce a filler value, we test
            // the current progress of the iterator for length - 1
            // against the progress the filler would have if we were to produce the filler value.
            // If producing a filler value wouldn't make filler progress greater than
            // the iterator progress, we produce a filler value.
            // (By 'progress' we mean what proportion of the total number of values of each
            // type we have produced).

            while ((fillerCount < fillerLength) && ((valueCount / (iterableLength - 1)) >= ((fillerCount + 1) / fillerLength))) {
                yield options.fillValue;
                ++fillerCount;
            }
        }

        // console.log("valueCount", valueCount, typeof iterable);

        // This is here through an abundance of caution.
        // It could help if the iterable somehow produces fewer values than expected
        // as it would ensure that the new list comes out at the expected length, but clearly,
        // in that case, the distribution of real values and filler values would not be correct.
        while (fillerCount < fillerLength) {
            yield options.fillValue;
            ++fillerCount;
        }
    }

    return generable(_spread)();
}