// deno-lint-ignore-file
// Promise and AsyncIterable implementations

import { delay, getIterator, Timeout } from "./utility.ts";

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
    }
}
