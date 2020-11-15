import { AsyncList, AsyncPromise } from "./promise.ts";

Deno.test("promise", async function () {
    const p = new AsyncPromise<number>();
    p.then(x => console.log("A", x));
    p.then(x => console.log("B", x));
    p.resolve(23);
    await p;

    const l = new AsyncList<number>();
    l.onChange.then(x => console.log("L1", x));
    l.onChange.then(x => console.log("L2", x));
    l.change();

    l.list = [1,2,3,4];
    l.change();

    for await (const n of l) {
        console.log("Loop", n);
        break;
    }

    l.close();

    console.log("done");
});