// Promise and AsyncIterable implementations

/**
 * A Promise that you can resolve or reject by
 * calling `promise.resolve()` or `promise.reject()`
 */
export class AsyncPromise<T> implements Promise<T> {
    promise: Promise<T>;

    /** Resolves the promise */
    resolve?: (value?: T | PromiseLike<T>) => void;
    
    /** Rejects the promise */
    // deno-lint-ignore no-explicit-any
    reject?: (reason?: any) => void;

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
 * async iterators will automatically get the new elements
 */
class AsyncList<T> implements AsyncIterable<T> {
    list: T[] = [];
    status: "active" | "done" = "active";
    waitingIterators: AsyncPromise<void>[] = [];

    get length(): number {
        return this.list.length;
    }

    /** Notifies any iterators that more data is available or that the list is complete */
    change() {
        const promises = this.waitingIterators;
        this.waitingIterators = [];

        for (const promise of promises) {
            promise.resolve!();
        }
    }

    finish() {
        this.status = "done";
        this.change();
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

            const promise = new AsyncPromise<void>();
            this.waitingIterators.push(promise);
            await promise;
        }
    }
}
