import { zip, slice, arrayFrom, spread, length, generable } from "./utility.ts"

async function* gen_<T>(values: T[]) {
    for (const v of values) {
        yield v;
    }
}

const gen = generable(gen_);

Deno.test("slice", async function () {
    const length = 2;
    let a = slice(gen([1, 2, 3, 4, 5]), undefined, length);
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
    let a = slice(gen([1, 2, 3, 4, 5]), start, end);
    let b = await arrayFrom(a);
    if (b.length != length) {
        throw `FAIL: slice: Length: Expected ${length}, Actual ${b.length}`;
    }
    if (b[0] !== 2) {
        throw `FAIL: slice`;
    }
});

Deno.test("zip", async function () {
    let a = gen([1, 2, 3, 4, 5]);
    let b = gen(["1", "2", "3"]);
    let x = await zip(a, b, { fillValue: "-" });
    // let x = await zip(a, b, b);
    let y = await arrayFrom(x);
    console.log(y);

    let z = await arrayFrom(x);
    console.log("2nd", z);
});

Deno.test("zip2", async function () {
    let x = await zip("abcde", "123456", { fillValue: undefined });
    // let x = await zip(a, b, b);
    let y = await arrayFrom(x);
    console.log(y);
});

Deno.test("length", async function () {
    const x = [
        [1, 2, 3, 4, 5],
        "12345",
        (function* () { yield 1; yield 2; })()
    ];
    for (const item of x) {
        const y = await length(item as Iterable<string | number>);
        console.log(y);
    }
});

Deno.test("spread", async function () {
    let x = [1, 2, 3, 4, 5];
    let y = spread(x, x.length, { newLength: 9, fillValue: undefined });
    let z = await arrayFrom(y);
    console.log(z);
});

Deno.test("spread2", async function () {
    let x = [1, 2, 3, 4, 5];
    const newLengths = [5, 6, 7, 8, 9, 10, 11, 15, 23, 45];
    for (const newLength of newLengths) {
        let y = spread(x, x.length, { newLength, fillValue: "*" });
        let z = await arrayFrom(y);
        if (z.length !== newLength) {
            throw "bad length";
        }
        console.log(z);
    }
});

Deno.test("generators", async function () {
    async function* gen(x: number) { yield x; }
    const x = gen(1);

    for await (const item of x) {
        console.log("unwrapped 1", item);
    }

    for await (const item of x) {
        console.log("unwrapped 2", item);
    }

    const gen2 = generable(gen);
    const y = gen2(2);

    for await (const item of y) {
        console.log("wrapped 1", item);
    }

    for await (const item of y) {
        console.log("wrapped 2", item);
    }
});