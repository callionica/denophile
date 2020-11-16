import { AsyncList, AsyncPromise, AsyncIterableWithTimeout, delay } from "./promise.ts";

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

Deno.test("timeout", async function () {
    const l = new AsyncList<number>();
    l.list = [1,2,3,4];

    const timedList = new AsyncIterableWithTimeout(l);

    console.log(Date.now());
    for await (const n of timedList) {
        console.log(n);
    }

    console.log("done", Date.now());

    l.close();
});

Deno.test("promise-error", async function () {
    const perLoop = delay(3000);
    for (let i = 0; i < 1; i++) {
        const perItem = delay(1000);
        const o = await Promise.race([perLoop, perItem]);
        console.log(o);
    }
    await perLoop;
});