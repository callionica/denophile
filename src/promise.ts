// deno-lint-ignore-file
// Promise and AsyncIterable implementations

import { getIterator } from "./utility.ts";

interface PromiseCancelable<T> extends Promise<T> {
    cancel(): void;
}

/**
 * A Promise that you can resolve or reject by
 * calling `promise.resolve()` or `promise.reject()`
 */
export class AsyncPromise<T> implements Promise<T> {
    promise: Promise<T>;

    /** Resolves the promise */
    resolve!: (value?: T | PromiseLike<T>) => void;

    /** Rejects the promise */
    // deno-lint-ignore no-explicit-any
    reject!: (reason?: any) => void;

    then: Promise<T>["then"];
    catch: Promise<T>["catch"];
    finally: Promise<T>["finally"];
    [Symbol.toStringTag]: string;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });

        this.then = this.promise.then.bind(this.promise);
        this.catch = this.promise.catch.bind(this.promise);
        this.finally = this.promise.finally.bind(this.promise);
        this[Symbol.toStringTag] = this.promise[Symbol.toStringTag];
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
 */
export function delay(ms: number): PromiseCancelable<Timeout> {
    const promise = new AsyncPromiseCancelable<Timeout>();
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
 * AsyncList is a list to which elements may be added asynchronously and
 * async iterators will automatically get the new elements.
 */
export class AsyncList<T> implements AsyncIterable<T> {
    list: T[] = [];
    status: "active" | "done" = "active";
    onChange_: AsyncPromise<void> = new AsyncPromise();

    get length(): number {
        return this.list.length;
    }

    /**
     * Notifies interested parties (including iterators) that more data is available
     * or that the list is complete.
     */
    change() {
        const promise = this.onChange_;
        this.onChange_ = new AsyncPromise();
        promise.resolve();
    }

    /**
     * Sets the list status to "done" so that iterators will terminate
     * and calls to onChange will throw an exception.
     */
    close() {
        this.status = "done";
        this.change();
    }

    /**
     * Provides a notification for the next change only.
     * Get the value of this property again to get notified of another change.
     */
    get onChange(): Promise<void> {
        if (this.status === "done") {
            // Throw an exception because there won't be any future changes
            // so anyone awaiting this promise would be waiting a loooong time.
            throw new Error(`AsyncList is done`);
        }
        return this.onChange_;
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

            await this.onChange;
        }
    }
}

export class AsyncIterableWithTimeout<T> implements AsyncIterable<T> {
    iterable: AsyncIterable<T>;
    perLoopMS: number = 3000;
    perItemMS: number = 1000;

    constructor(iterable: AsyncIterable<T>) {
        this.iterable = iterable;
    }

    [Symbol.asyncIterator](): AsyncIterator<T> {
        return this.iterator();
    }

    async * iterator() {
        const perLoop = delay(this.perLoopMS);
        const it = getIterator(this.iterable);
        while (true) {
            const perItem = delay(this.perItemMS);
            const o = await Promise.race([it.next(), perLoop, perItem]);
            perItem.cancel();

            if (o instanceof Timeout) {
                // Delay is exceeded
                // await it.return?.(); // TODO
                break;
            }

            const { done, value } = o;

            if (done) {
                // await it.return?.(); // TODO
                break;
            }

            yield value;
        }
        perLoop.cancel();
    }
}
