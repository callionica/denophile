// deno-lint-ignore-file
// Promise and AsyncIterable implementations

import { getIterator } from "./utility.ts";

/** If T is Promise<U> then UnPromise<T> is U. Otherwise UnPromise<T> is T. */
export type UnPromise<T> = T extends PromiseLike<infer U> ? U : T;

/**
 * A promise that can be canceled.
 * 
 * Canceling a promise either resolves it or rejects it
 * and cancels the operation that would normally
 * lead to the settlement of the promise.
 * 
 * The exact results of canceling a promise will depend on the particular API
 * so read the documentation to understand exactly what `cancel` does.
 */
export interface PromiseCancelable<T> extends Promise<T> {
    /**
     * Cancels the operation that would normally lead to the promise
     * being settled and settles the promise by resolving or rejecting it.
     * 
     * Read the documentation for the specific API to understand whether the 
     * promise will be resolved or rejected and what value or reason will be
     * returned.
     * 
     * Note that cancellation may be an asynchronous operation, but you don't
     * need to await the `cancel` call itself because you will know
     * when cancellation is complete by the settlement of the promise.
     * 
     * Implementations of `cancel` should ensure that cancel can be called multiple
     * times without problem.
     */
    cancel(): void;
}

/**
 * A wrapper for a promise to be used as a base class
 */
export class PromiseWrapper<T> implements Promise<T> {
    promise: Promise<T>;

    then: Promise<T>["then"];
    catch: Promise<T>["catch"];
    finally: Promise<T>["finally"];
    [Symbol.toStringTag]: string;

    constructor(promise: Promise<T>) {
        this.promise = promise;

        this.then = this.promise.then.bind(this.promise);
        this.catch = this.promise.catch.bind(this.promise);
        this.finally = this.promise.finally.bind(this.promise);
        this[Symbol.toStringTag] = this.promise[Symbol.toStringTag];
    }
}

/** A promise that you can cancel */
export class PromiseCancelableWrapper<T> extends PromiseWrapper<T> implements PromiseCancelable<T> {
    /**
     * Cancels the action that would normally resolve the promise.
     * Cancellation may resolve or reject the promise or do neither.
     * Read the docs for the specific use!
     * */
    cancel!: () => void;
}

/**
 * A Promise that you can resolve or reject by
 * calling `promise.resolve()` or `promise.reject()`
 */
export class AsyncPromise<T> extends PromiseWrapper<T> {
    /** Resolves the promise */
    resolve!: (value?: T | PromiseLike<T>) => void;

    /** Rejects the promise */
    // deno-lint-ignore no-explicit-any
    reject!: (reason?: any) => void;

    constructor() {
        let res!: (value?: T | PromiseLike<T>) => void;
        let rej!: (reason?: any) => void;

        const promise: Promise<T> = new Promise((resolve, reject) => {
            res = resolve;
            rej = reject;
        });

        super(promise);

        this.resolve = res;
        this.reject = rej;
    }
}

/** A promise that you can resolve, reject, or cancel */
class AsyncPromiseCancelable<T> extends AsyncPromise<T> {
    /**
     * Cancels the action that would normally resolve the promise.
     * Cancellation may resolve or reject the promise or do neither.
     * Read the docs for the specific use!
     * */
    cancel!: () => void;
}

/** A specific class to return from async functions for when we use Promise.race etc */
export class Timeout { }
export class TimeoutExpired extends Timeout { }
export class TimeoutCanceled extends Timeout { }

/**
 * Wait for a specified number of milliseconds.
 * The promise returned is cancellable.
 * The promise can be resolved by the time expiring,
 * in which case the return value is an instance of TimeoutExpired.
 * The promise can also be resolved by cancelation,
 * in which case the return value is an instance of TimeoutCanceled.
 * 
 * Note that calling `cancel` multiple times is OK.
 */
export function delay(ms: number): PromiseCancelable<TimeoutExpired | TimeoutCanceled> {
    const promise = new AsyncPromiseCancelable<TimeoutExpired | TimeoutCanceled>();
    const token = setTimeout(() => promise.resolve(new TimeoutExpired()), ms);
    promise.cancel = () => { clearTimeout(token); promise.resolve(new TimeoutCanceled()); };
    return promise;
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

/**
 * Races a bunch of promises against a timeout. Who will win?
 * 
 * If the timeout wins, the promise is resolved to an instance of TimeoutExpired.
 * 
 * If the promise is canceled, the promise is resolved to an instance of TimeoutCanceled.
 * 
 * @param values Promises to race
 * @param ms A timeout to join the race
 */
export function raceAgainstTime<T>(values: readonly T[], ms: number)
    : PromiseCancelable<TimeoutExpired | TimeoutCanceled | UnPromise<T>> {
    
    // Create the timeout
    const timeout = delay(ms);
    
    // Start the race
    const original = Promise.race([...values, timeout]);
    
    // Cancel the timeout as soon as the race ends however the race ends
    original.finally(() => { timeout.cancel(); });
    
    // Create a wrapper so the caller can cancel the race early
    const promise = new PromiseCancelableWrapper(original);
    promise.cancel = timeout.cancel.bind(timeout);

    // This code works because calling cancel twice is OK
    // (which can happen when caller calls cancel and then the finally calls cancel)
    // It is the responsibility of the cancel implementation
    // to ensure safety in the face of multiple calls.

    // Return the cancelable promise
    return promise;
}

/**
 * AsyncList is a list to which elements may be added asynchronously and
 * async iterators will automatically get the new elements.
 */
export class AsyncList<T> implements AsyncIterable<T> {
    list: T[] = [];
    status: "active" | "done" = "active";
    nextChange_: AsyncPromise<void> = new AsyncPromise();

    get length(): number {
        return this.list.length;
    }

    /**
     * Notifies interested parties (including iterators) that more data is available
     * or that the list is complete.
     */
    change() {
        const thisChange = this.nextChange_;
        if (this.status !== "done") {
            this.nextChange_ = new AsyncPromise();
        }
        thisChange.resolve();
    }

    /**
     * Sets the list status to "done" so that iterators will terminate
     * and calls to `nextChange` will throw an exception.
     */
    close() {
        this.status = "done";
        this.change();
    }

    /**
     * Provides a notification for the next change only.
     * Call this again to get notified of another change.
     */
    nextChange(): Promise<void> {
        if (this.status === "done") {
            // Throw an exception because there won't be any future changes
            // so anyone awaiting this promise would be waiting a loooong time.
            throw new Error(`AsyncList is done`);
        }
        return this.nextChange_;
    }

    [Symbol.asyncIterator](): AsyncIterator<T> {
        return this.iterator();
    }

    async * iterator() {
        let index = 0;

        while (true) {
            for (; index < this.list.length; ++index) {
                yield this.list[index];
            }

            if (this.status === "done") {
                break;
            }

            await this.nextChange();
        }
    }

    push(...items: T[]): number {
        if (this.status === "done") {
            throw new Error(`AsyncList is done`);
        }

        const result = this.list.push(...items);
        this.change();
        return result;
    }
}

/**
 * Wraps an async iterable with one that adds a per-loop and per-item timeout.
 * Currently, if either timeout expires, the iterator just returns immediately
 * (so there is no error or other detectable condition - just like a short list).
 */
export class AsyncIterableWithTimeout<T> implements AsyncIterable<T> {
    iterable: AsyncIterable<T>;
    perLoopMS: number = 3000;
    perItemMS: number = 1000;

    constructor(iterable: AsyncIterable<T>, perLoopMS?: number, perItemMS?: number) {
        this.iterable = iterable;

        if (perLoopMS !== undefined) {
            this.perLoopMS = perLoopMS;
        }

        if (perItemMS !== undefined) {
            this.perItemMS = perItemMS;
        }
    }

    [Symbol.asyncIterator](): AsyncIterator<T> {
        return this.iterator();
    }

    async * iterator() {
        const perLoop = delay(this.perLoopMS);
        try {
            const it = getIterator(this.iterable);
            while (true) {
                const o = await raceAgainstTime([it.next(), perLoop], this.perItemMS);

                if (o instanceof Timeout) {
                    // Delay is exceeded
                    break;
                }

                const { done, value } = o;

                if (done) {
                    break;
                }

                yield value;
            }
        } finally {
            perLoop.cancel();
        }
    }
}

const ignored: Promise<any>[] = [];

export function ignore(promise: Promise<any>): void {
    ignored.push(promise);
}

export function awaitExit() {
    return Promise.allSettled(ignored);
}