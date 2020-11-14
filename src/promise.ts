// Promise and AsyncIterable implementations
import { PromiseX } from "./utility.ts";

/**
 * AsyncList is a list to which elements may be added asynchronously and
 * async iterators will automatically get the new elements
 */
class AsyncList<T> implements AsyncIterable<T> {
    list: T[] = [];
    status: "active" | "done" = "active";
    promises: PromiseX<void>[] = [];

    get length(): number {
        return this.list.length;
    }

    /** Notifies any iterators that more data is available or that the list is complete */
    change() {
        const promises = this.promises;
        this.promises = [];

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

            const promise = new PromiseX<void>();
            this.promises.push(promise);
            await promise;
        }
    }
}
