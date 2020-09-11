import { zip, slice, arrayFrom } from "./utility.ts"

async function* gen<T>(values: T[]) : AsyncIterable<T> {
    for (const v of values) {
        yield v;
    }
}

Deno.test("slice", async function () {
    const length = 2;
    let a = slice(gen([1,2,3,4,5]), undefined, length);
    let b = await arrayFrom(a);
    if (b.length != length) {
        throw `FAIL: slice: Length: Expected ${length}, Actual ${b.length}`;
    }
    if (b[0] !== 1) {
        throw `FAIL: slice`;
    }
});

Deno.test("slice2", async function () {
    const start = 1;
    const end = 3;
    const length = end - start;
    let a = slice(gen([1,2,3,4,5]), start, end);
    let b = await arrayFrom(a);
    if (b.length != length) {
        throw `FAIL: slice: Length: Expected ${length}, Actual ${b.length}`;
    }
    if (b[0] !== 2) {
        throw `FAIL: slice`;
    }
});

Deno.test("zip", async function () {
    let a = gen([1,2,3,4,5]);
    let b = gen(["1", "2", "3"]);
    let x = await zip(a, b);
    let y = await arrayFrom(x);
    console.log(y);
});