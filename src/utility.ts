// Requires: [Typescript 4.0]
// Supports: [Deno]

// A library of compile-time and run-time utilities by Callionica

/** Wait for a specified number of milliseconds */
export function delay(ms: number): Promise<void> {
    return new Promise((resolve): number =>
        setTimeout((): void => {
            resolve();
        }, ms)
    );
}

/**
 * Retries a function when it fails, with variable time delays between each attempt.
 * The function will be retried once for each entry in the delays array.
 * 
 * @param fn The function to execute
 * @param delays An array of millisecond timings for each delay before retrying
 */
export async function retry<T>(fn: () => T | Promise<T>, delays: number[]): Promise<T> {
    try {
        return await fn();
    } catch (e) {
        if (delays.length === 0) {
            throw e;
        }
        console.log("RETRY", new Date(), delays[0]);
        await delay(delays[0]);
        return await retry(fn, delays.slice(1));
    }
}

/**
 * Helps to ensure that a function cannot be called too frequently over the long term.
 * It does this by returning a new function that will delay the call to the inner function
 * by the necessary amount based on how many previous calls there have been and how much time 
 * has elapsed since the first call.
 * 
 * Note that this function does _not_ ensure that any 2 calls to the function have a
 * minimum delay between them. It deliberately allows bursty calls while preventing
 * too many calls over the long term. A "large gap reset" means that it never gets 
 * too bursty.
 * 
 * The large gap reset means that if the function falls behind by
 * 10 times the average desired gap, the tracked statistics are reset and throttling
 * acts like the function has been called for the first time.
 * 
 * @param fn The function to be wrapped.
 * @param delayMS The average delay in milliseconds between calls to the function.
 */
// deno-lint-ignore no-explicit-any
export function throttle<T extends (...args: any[]) => any>(
    fn: T,
    delayMS: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
    let count = 0;
    let first: number | undefined;

    async function fn_(...args: Parameters<T>): Promise<ReturnType<T>> {
        const now = Date.now();

        ++count;
        if (first === undefined) {
            first = Date.now();
        }

        const elapsed = now - first;
        const desiredElapsed = (count - 1) * delayMS;
        const currentDelay = desiredElapsed - elapsed;
        if (currentDelay > 0) {
            await delay(currentDelay);
        } else if ((-currentDelay) > (10 * delayMS)) {
            // We're running a lot slower than expected
            // To ensure that we don't suddenly produce a massive burst
            // in an attempt to catch up, reset all the statistics
            count = 1;
            first = now;
        }

        return (await fn(...args)) as ReturnType<T>;
    }
    return fn_;
}

export function dataToHex(data: Uint8Array): string {
    function byteToHex(byte: number): string {
        return byte.toString(16).padStart(2, "0");
    }
    return Array.prototype.map.call(data, byteToHex).join("");
}

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
export function iterable<Args extends unknown[], Result>(generator: (...t: Args) => Generator<Result>): (...t: Args) => Iterable<Result> {
    // Javascript generators are not iterables (although they can be used that way ONCE!)
    // Javascript generators are iterators.
    // To create a real, reusable iterable, we need to capture the function that returns
    // the generator and call that function each time the iterator is obtained.
    return (...args) => {
        return {
            repeatable: true,
            [Symbol.iterator]: () => { return generator(...args); }
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
    const iterators = iterables.map(getIterator);
    const its = (await Promise.all(iterators)).map(it => ({ done: false, iterator: it }));
    let remaining = its.length;
    while (true) {
        const result = [];
        for (const it of its) {
            if (it.done) {
                result.push(fillValue);
            } else {
                const current = await it.iterator.next();
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
        for await (const item of iterable) {
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
    for await (const item of iterable) {
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
export async function first<Item, Result>(iterable: AnyIterable<Item>, testAndMap: (item: Item) => (Promise<Result | undefined> | Result | undefined)): Promise<Result | undefined> {
    let result: Result | undefined;
    for await (const item of iterable) {
        if (undefined !== (result = await testAndMap(item))) {
            break;
        }
    }
    return result;
}

/**
 * Like Array.filter except asynchronous.
 * 
 * Takes a synchronous or asynchronous iterable as input.
 * Takes a synchronous or asynchronous function as the predicate.
 * Returns an asynchronous iterable that returns the items
 * that match the predicate.
 */
export function filter<Item>(iterable: AnyIterable<Item>, predicate: (item: Item) => (Promise<boolean> | boolean)): AsyncIterable<Item> {
    async function* filter_() {
        for await (const item of iterable) {
            if (await predicate(item)) {
                yield item;
            }
        }
    }
    return generable(filter_)();
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
 * @param fillValue The value used to spread out the list to the desired length
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

/**
 * Sorting in English should ignore leading articles like 'The' and 'An' and
 * should also recognize numbers within the text so that '2' comes before '10'.
 * This function takes a natural language string and manipulates it to produce a new string
 * that can be used for English sorting by moving articles to the end of the string,
 * padding numbers with leading zeroes, and removing/replacing diacritics and symbols.
 * 
 * @param name The text from which to generate a sortable string
 */
export function toSortableName(name: string): string {
    let result = name;

    // Get (a small number of) uncommon characters for later disambiguation
    const symbols = result.replace(/[.a-zA-Z0-9 '\-]/g, "").substring(0, 8);

    // Convert northern european letters
    result = result.replace(/Å/g, "Aa");
    result = result.replace(/Ø|Ö|Œ/g, "Oe");
    result = result.replace(/Æ/g, "Ae");
    result = result.replace(/å/g, "aa");
    result = result.replace(/ø|ö|œ/g, "oe");
    result = result.replace(/æ/g, "ae");

    // Convert ampersand to and
    result = result.replace(/ & /g, " and ");

    // Remove diacritics
    result = removeDiacritics(result);

    // Remove some punctuation
    result = result.replace(/['`]/g, "");

    // Replace punctuation except dashes & periods
    result = result.replace(/[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\/:;<=>?@\[\]^_`{|}~]/g, " ");

    // Clean up spaces
    result = result.trim();
    result = result.replace(/ {2,}/g, " ");

    // Move articles (like 'The' or 'An') to the end of the name
    const articleRE = /^(?<article>(the)|(an?)|(l[aeo]s?)|(un[ae]?)|(un[ao]s)|(des))\s(?<body>.*)$/i;
    const match = articleRE.exec(result);
    if (match && match.groups) {
        const article = match.groups["article"];
        const body = match.groups["body"];
        result = `${body} ${article}`;
    }

    // Get the first letter for later disambiguation
    const initialCase = result[0] || "";

    // Pad numbers with leading zeroes so that numeric sorting works

    // deno-lint-ignore no-explicit-any
    function applyPadding(match: string, prefix: string, number: string, offset: number, original: string, groups: any) {
        return prefix + number.padStart(6, "0");
    }

    const numberRE = /(?<prefix>^|[^0123456789.])(?<number>\d+)/ig;

    result = result.replace(numberRE, applyPadding);

    // lowercase - keeping extra info for disambiguation
    result = result.toLowerCase() + ` ${initialCase}${symbols}`;

    return result;
}

/** Returns a string suitable for use in a URL */
export function toURLName(name: string): string {
    let c1 = name;

    // lowercase
    c1 = c1.toLowerCase();

    // Convert northern european letters
    c1 = c1.replace(/å/g, "aa");
    c1 = c1.replace(/ø|ö|œ/g, "oe");
    c1 = c1.replace(/æ/g, "ae");

    // Convert ampersand to and
    c1 = c1.replace(/ & /g, " and ");

    // Convert underscore to space
    c1 = c1.replace(/_/g, " ");

    // Remove diacritics
    c1 = removeDiacritics(c1);

    // Remove punctuation except dashes & periods
    c1 = c1.replace(/[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\/:;<=>?@\[\]^_`{|}~]/g, "");

    // Collapse to english 26 and digits by replacing with dashes
    c1 = c1.replace(/[^a-z0-9]/g, "-");

    // Coalesce multiple contiguous dashes 
    c1 = c1.replace(/-{2,}/g, "-");

    return c1;
}

const diacritics = [
    { 'base': 'A', 'letters': '\u0041\u24B6\uFF21\u00C0\u00C1\u00C2\u1EA6\u1EA4\u1EAA\u1EA8\u00C3\u0100\u0102\u1EB0\u1EAE\u1EB4\u1EB2\u0226\u01E0\u00C4\u01DE\u1EA2\u00C5\u01FA\u01CD\u0200\u0202\u1EA0\u1EAC\u1EB6\u1E00\u0104\u023A\u2C6F' },
    { 'base': 'AA', 'letters': '\uA732' },
    { 'base': 'AE', 'letters': '\u00C6\u01FC\u01E2' },
    { 'base': 'AO', 'letters': '\uA734' },
    { 'base': 'AU', 'letters': '\uA736' },
    { 'base': 'AV', 'letters': '\uA738\uA73A' },
    { 'base': 'AY', 'letters': '\uA73C' },
    { 'base': 'B', 'letters': '\u0042\u24B7\uFF22\u1E02\u1E04\u1E06\u0243\u0182\u0181' },
    { 'base': 'C', 'letters': '\u0043\u24B8\uFF23\u0106\u0108\u010A\u010C\u00C7\u1E08\u0187\u023B\uA73E' },
    { 'base': 'D', 'letters': '\u0044\u24B9\uFF24\u1E0A\u010E\u1E0C\u1E10\u1E12\u1E0E\u0110\u018B\u018A\u0189\uA779\u00D0' },
    { 'base': 'DZ', 'letters': '\u01F1\u01C4' },
    { 'base': 'Dz', 'letters': '\u01F2\u01C5' },
    { 'base': 'E', 'letters': '\u0045\u24BA\uFF25\u00C8\u00C9\u00CA\u1EC0\u1EBE\u1EC4\u1EC2\u1EBC\u0112\u1E14\u1E16\u0114\u0116\u00CB\u1EBA\u011A\u0204\u0206\u1EB8\u1EC6\u0228\u1E1C\u0118\u1E18\u1E1A\u0190\u018E' },
    { 'base': 'F', 'letters': '\u0046\u24BB\uFF26\u1E1E\u0191\uA77B' },
    { 'base': 'G', 'letters': '\u0047\u24BC\uFF27\u01F4\u011C\u1E20\u011E\u0120\u01E6\u0122\u01E4\u0193\uA7A0\uA77D\uA77E' },
    { 'base': 'H', 'letters': '\u0048\u24BD\uFF28\u0124\u1E22\u1E26\u021E\u1E24\u1E28\u1E2A\u0126\u2C67\u2C75\uA78D' },
    { 'base': 'I', 'letters': '\u0049\u24BE\uFF29\u00CC\u00CD\u00CE\u0128\u012A\u012C\u0130\u00CF\u1E2E\u1EC8\u01CF\u0208\u020A\u1ECA\u012E\u1E2C\u0197' },
    { 'base': 'J', 'letters': '\u004A\u24BF\uFF2A\u0134\u0248' },
    { 'base': 'K', 'letters': '\u004B\u24C0\uFF2B\u1E30\u01E8\u1E32\u0136\u1E34\u0198\u2C69\uA740\uA742\uA744\uA7A2' },
    { 'base': 'L', 'letters': '\u004C\u24C1\uFF2C\u013F\u0139\u013D\u1E36\u1E38\u013B\u1E3C\u1E3A\u0141\u023D\u2C62\u2C60\uA748\uA746\uA780' },
    { 'base': 'LJ', 'letters': '\u01C7' },
    { 'base': 'Lj', 'letters': '\u01C8' },
    { 'base': 'M', 'letters': '\u004D\u24C2\uFF2D\u1E3E\u1E40\u1E42\u2C6E\u019C' },
    { 'base': 'N', 'letters': '\u004E\u24C3\uFF2E\u01F8\u0143\u00D1\u1E44\u0147\u1E46\u0145\u1E4A\u1E48\u0220\u019D\uA790\uA7A4' },
    { 'base': 'NJ', 'letters': '\u01CA' },
    { 'base': 'Nj', 'letters': '\u01CB' },
    { 'base': 'O', 'letters': '\u004F\u24C4\uFF2F\u00D2\u00D3\u00D4\u1ED2\u1ED0\u1ED6\u1ED4\u00D5\u1E4C\u022C\u1E4E\u014C\u1E50\u1E52\u014E\u022E\u0230\u00D6\u022A\u1ECE\u0150\u01D1\u020C\u020E\u01A0\u1EDC\u1EDA\u1EE0\u1EDE\u1EE2\u1ECC\u1ED8\u01EA\u01EC\u00D8\u01FE\u0186\u019F\uA74A\uA74C' },
    { 'base': 'OI', 'letters': '\u01A2' },
    { 'base': 'OO', 'letters': '\uA74E' },
    { 'base': 'OU', 'letters': '\u0222' },
    { 'base': 'OE', 'letters': '\u008C\u0152' },
    { 'base': 'oe', 'letters': '\u009C\u0153' },
    { 'base': 'P', 'letters': '\u0050\u24C5\uFF30\u1E54\u1E56\u01A4\u2C63\uA750\uA752\uA754' },
    { 'base': 'Q', 'letters': '\u0051\u24C6\uFF31\uA756\uA758\u024A' },
    { 'base': 'R', 'letters': '\u0052\u24C7\uFF32\u0154\u1E58\u0158\u0210\u0212\u1E5A\u1E5C\u0156\u1E5E\u024C\u2C64\uA75A\uA7A6\uA782' },
    { 'base': 'S', 'letters': '\u0053\u24C8\uFF33\u1E9E\u015A\u1E64\u015C\u1E60\u0160\u1E66\u1E62\u1E68\u0218\u015E\u2C7E\uA7A8\uA784' },
    { 'base': 'T', 'letters': '\u0054\u24C9\uFF34\u1E6A\u0164\u1E6C\u021A\u0162\u1E70\u1E6E\u0166\u01AC\u01AE\u023E\uA786' },
    { 'base': 'TZ', 'letters': '\uA728' },
    { 'base': 'U', 'letters': '\u0055\u24CA\uFF35\u00D9\u00DA\u00DB\u0168\u1E78\u016A\u1E7A\u016C\u00DC\u01DB\u01D7\u01D5\u01D9\u1EE6\u016E\u0170\u01D3\u0214\u0216\u01AF\u1EEA\u1EE8\u1EEE\u1EEC\u1EF0\u1EE4\u1E72\u0172\u1E76\u1E74\u0244' },
    { 'base': 'V', 'letters': '\u0056\u24CB\uFF36\u1E7C\u1E7E\u01B2\uA75E\u0245' },
    { 'base': 'VY', 'letters': '\uA760' },
    { 'base': 'W', 'letters': '\u0057\u24CC\uFF37\u1E80\u1E82\u0174\u1E86\u1E84\u1E88\u2C72' },
    { 'base': 'X', 'letters': '\u0058\u24CD\uFF38\u1E8A\u1E8C' },
    { 'base': 'Y', 'letters': '\u0059\u24CE\uFF39\u1EF2\u00DD\u0176\u1EF8\u0232\u1E8E\u0178\u1EF6\u1EF4\u01B3\u024E\u1EFE' },
    { 'base': 'Z', 'letters': '\u005A\u24CF\uFF3A\u0179\u1E90\u017B\u017D\u1E92\u1E94\u01B5\u0224\u2C7F\u2C6B\uA762' },
    { 'base': 'a', 'letters': '\u0061\u24D0\uFF41\u1E9A\u00E0\u00E1\u00E2\u1EA7\u1EA5\u1EAB\u1EA9\u00E3\u0101\u0103\u1EB1\u1EAF\u1EB5\u1EB3\u0227\u01E1\u00E4\u01DF\u1EA3\u00E5\u01FB\u01CE\u0201\u0203\u1EA1\u1EAD\u1EB7\u1E01\u0105\u2C65\u0250' },
    { 'base': 'aa', 'letters': '\uA733' },
    { 'base': 'ae', 'letters': '\u00E6\u01FD\u01E3' },
    { 'base': 'ao', 'letters': '\uA735' },
    { 'base': 'au', 'letters': '\uA737' },
    { 'base': 'av', 'letters': '\uA739\uA73B' },
    { 'base': 'ay', 'letters': '\uA73D' },
    { 'base': 'b', 'letters': '\u0062\u24D1\uFF42\u1E03\u1E05\u1E07\u0180\u0183\u0253' },
    { 'base': 'c', 'letters': '\u0063\u24D2\uFF43\u0107\u0109\u010B\u010D\u00E7\u1E09\u0188\u023C\uA73F\u2184' },
    { 'base': 'd', 'letters': '\u0064\u24D3\uFF44\u1E0B\u010F\u1E0D\u1E11\u1E13\u1E0F\u0111\u018C\u0256\u0257\uA77A' },
    { 'base': 'dz', 'letters': '\u01F3\u01C6' },
    { 'base': 'e', 'letters': '\u0065\u24D4\uFF45\u00E8\u00E9\u00EA\u1EC1\u1EBF\u1EC5\u1EC3\u1EBD\u0113\u1E15\u1E17\u0115\u0117\u00EB\u1EBB\u011B\u0205\u0207\u1EB9\u1EC7\u0229\u1E1D\u0119\u1E19\u1E1B\u0247\u025B\u01DD' },
    { 'base': 'f', 'letters': '\u0066\u24D5\uFF46\u1E1F\u0192\uA77C' },
    { 'base': 'g', 'letters': '\u0067\u24D6\uFF47\u01F5\u011D\u1E21\u011F\u0121\u01E7\u0123\u01E5\u0260\uA7A1\u1D79\uA77F' },
    { 'base': 'h', 'letters': '\u0068\u24D7\uFF48\u0125\u1E23\u1E27\u021F\u1E25\u1E29\u1E2B\u1E96\u0127\u2C68\u2C76\u0265' },
    { 'base': 'hv', 'letters': '\u0195' },
    { 'base': 'i', 'letters': '\u0069\u24D8\uFF49\u00EC\u00ED\u00EE\u0129\u012B\u012D\u00EF\u1E2F\u1EC9\u01D0\u0209\u020B\u1ECB\u012F\u1E2D\u0268\u0131' },
    { 'base': 'j', 'letters': '\u006A\u24D9\uFF4A\u0135\u01F0\u0249' },
    { 'base': 'k', 'letters': '\u006B\u24DA\uFF4B\u1E31\u01E9\u1E33\u0137\u1E35\u0199\u2C6A\uA741\uA743\uA745\uA7A3' },
    { 'base': 'l', 'letters': '\u006C\u24DB\uFF4C\u0140\u013A\u013E\u1E37\u1E39\u013C\u1E3D\u1E3B\u017F\u0142\u019A\u026B\u2C61\uA749\uA781\uA747' },
    { 'base': 'lj', 'letters': '\u01C9' },
    { 'base': 'm', 'letters': '\u006D\u24DC\uFF4D\u1E3F\u1E41\u1E43\u0271\u026F' },
    { 'base': 'n', 'letters': '\u006E\u24DD\uFF4E\u01F9\u0144\u00F1\u1E45\u0148\u1E47\u0146\u1E4B\u1E49\u019E\u0272\u0149\uA791\uA7A5' },
    { 'base': 'nj', 'letters': '\u01CC' },
    { 'base': 'o', 'letters': '\u006F\u24DE\uFF4F\u00F2\u00F3\u00F4\u1ED3\u1ED1\u1ED7\u1ED5\u00F5\u1E4D\u022D\u1E4F\u014D\u1E51\u1E53\u014F\u022F\u0231\u00F6\u022B\u1ECF\u0151\u01D2\u020D\u020F\u01A1\u1EDD\u1EDB\u1EE1\u1EDF\u1EE3\u1ECD\u1ED9\u01EB\u01ED\u00F8\u01FF\u0254\uA74B\uA74D\u0275' },
    { 'base': 'oi', 'letters': '\u01A3' },
    { 'base': 'ou', 'letters': '\u0223' },
    { 'base': 'oo', 'letters': '\uA74F' },
    { 'base': 'p', 'letters': '\u0070\u24DF\uFF50\u1E55\u1E57\u01A5\u1D7D\uA751\uA753\uA755' },
    { 'base': 'q', 'letters': '\u0071\u24E0\uFF51\u024B\uA757\uA759' },
    { 'base': 'r', 'letters': '\u0072\u24E1\uFF52\u0155\u1E59\u0159\u0211\u0213\u1E5B\u1E5D\u0157\u1E5F\u024D\u027D\uA75B\uA7A7\uA783' },
    { 'base': 's', 'letters': '\u0073\u24E2\uFF53\u00DF\u015B\u1E65\u015D\u1E61\u0161\u1E67\u1E63\u1E69\u0219\u015F\u023F\uA7A9\uA785\u1E9B' },
    { 'base': 't', 'letters': '\u0074\u24E3\uFF54\u1E6B\u1E97\u0165\u1E6D\u021B\u0163\u1E71\u1E6F\u0167\u01AD\u0288\u2C66\uA787' },
    { 'base': 'tz', 'letters': '\uA729' },
    { 'base': 'u', 'letters': '\u0075\u24E4\uFF55\u00F9\u00FA\u00FB\u0169\u1E79\u016B\u1E7B\u016D\u00FC\u01DC\u01D8\u01D6\u01DA\u1EE7\u016F\u0171\u01D4\u0215\u0217\u01B0\u1EEB\u1EE9\u1EEF\u1EED\u1EF1\u1EE5\u1E73\u0173\u1E77\u1E75\u0289' },
    { 'base': 'v', 'letters': '\u0076\u24E5\uFF56\u1E7D\u1E7F\u028B\uA75F\u028C' },
    { 'base': 'vy', 'letters': '\uA761' },
    { 'base': 'w', 'letters': '\u0077\u24E6\uFF57\u1E81\u1E83\u0175\u1E87\u1E85\u1E98\u1E89\u2C73' },
    { 'base': 'x', 'letters': '\u0078\u24E7\uFF58\u1E8B\u1E8D' },
    { 'base': 'y', 'letters': '\u0079\u24E8\uFF59\u1EF3\u00FD\u0177\u1EF9\u0233\u1E8F\u00FF\u1EF7\u1E99\u1EF5\u01B4\u024F\u1EFF' },
    { 'base': 'z', 'letters': '\u007A\u24E9\uFF5A\u017A\u1E91\u017C\u017E\u1E93\u1E95\u01B6\u0225\u0240\u2C6C\uA763' }
];

const diacriticsMap: Record<string, string> = {};
for (let i = 0; i < diacritics.length; ++i) {
    const letters = diacritics[i].letters;
    for (let j = 0; j < letters.length; ++j) {
        diacriticsMap[letters[j]] = diacritics[i].base;
    }
}

function removeDiacritics(text: string) {
    // deno-lint-ignore no-control-regex
    return text.replace(/[^\u0000-\u007E]/g, function (letter: string) {
        return diacriticsMap[letter] || letter;
    });
}    
