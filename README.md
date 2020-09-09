# denophile
Deno-related code and documentation #denoland #typescript #rust

## file.ts
file.ts contains a minimal, low-level file API that builds on Deno's built-in file functions. It's not compatible with anything, it just represents the operations that I like to have available for reading files. The most interesting function is readRanges which, given a byte range, returns an iterable that yields the specified byte range from the file and any subsequent ranges of the same size. The functions are defined in terms of Uint8Arrays and allow optimization by the caller providing a (completely optional) buffer. Useful for building a server that handles byte range requests. Another point to note: this API allows you to pass file:// URLs in string form.

## utility.ts
utility.ts contains compile-time and run-time utilities.

The most interesting utility currently in utility.ts is a fully-typed version of `zip`.

Use `zip` if you have multiple lists and you want a new list where the Nth item in the new list is the collection of the Nth items from each of the original lists.

If any of the lists is shorter than the longest list, `undefined` is used to represent the missing values from that list.

Because the function allows both synchronous and asynchronous iterables as input, the result is an asynchronous iterable, which you can iterate over using `for await ( ... of ... )`.

`zip` is comparable to Python's `zip_longest` with a `fillvalue` of `undefined`.

utility.ts requires Typescript 4.0 or later.

## Type Transforms in utility.ts
utility.ts contains some type transforms that you might find educational.

A type transform is a generic type that takes a tuple type as input and produces a different tuple type as output. It is the equivalent of calling `map` on an array. Here's the one used for the return type of the `zip` function. 

```
type Zip<T extends unknown[], Result extends unknown[] = []> = {
    0: Zip<Tail<T>, Prepend<(InferIteratorValue<Head<T>> | undefined), Result>>,
    1: Reverse<Result>
}[Length<T> extends Zero ? 1 : 0];
```

T is a tuple of iterable types and the result is a typle of the value types of those iterables.
(Each value types is actually combined with `| undefined` to make it optional).