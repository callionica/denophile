# denophile
Deno-related code and documentation #denoland #typescript #rust

## file.ts
file.ts contains a minimal, low-level file API that builds on Deno's built-in file functions. It's not compatible with anything, it just represents the operations that I like to have available for reading files. The most interesting function is readRanges which, given a byte range, returns an iterable that yields the specified byte range from the file and any subsequent ranges of the same size. The functions are defined in terms of Uint8Arrays and allow optimization by the caller providing a (completely optional) buffer. Useful for building a server that handles byte range requests. Another point to note: this API allows you to pass file:// URLs in string form.

## utility.ts
utility.ts contains compile-time and run-time utilities.

The most interesting utility currently in utility.ts is a fully-typed version of `zip`.

Use `zip` if you have multiple lists and you want a new list where the Nth item in the new list is the collection of the Nth items from each of the original lists.

If any of the lists is shorter than the longest list, the specified fill value is used to represent the missing values from any list.

Because the function allows both synchronous and asynchronous iterables as input, the result is an asynchronous iterable, which you can iterate over using `for await ( ... of ... )`.

`zip` is comparable to Python's `zip_longest`.

utility.ts requires Typescript 4.0 or later.

## Type Transforms in utility.ts
utility.ts contains some type transforms that you might find educational.

A type transform is a generic type that takes a tuple type as input and produces a different tuple type as output. It is the equivalent of calling `map` on an array, only all of these type transformations happen at compile time. Here's the one used for the return type of the `zip` function. 

```
/**
 * Takes in a list of iterable types
 * and returns a list of value types.
 */ 
type ValuesOfIterables<Input extends unknown[], Result extends unknown[] = []> = {
    'Continue': ValuesOfIterables<Tail<Input>, Prepend<(ValueOfIterable<Head<Input>>), Result>>,
    'Return': Reverse<Result>
}[Length<Input> extends Zero ? 'Return' : 'Continue'];
```

Input is a tuple of iterable types and the result is a tuple of the value types of those iterables.

This follows a familiar pattern which can be captured in a VS Code snippet:

```
"Type map": {
		"prefix": "tm$",
		"body":[
			"type ${1:name}<Input extends unknown[], Result extends unknown[] = []> = {",
			"    'Continue': ${1:name}<Tail<Input>, Prepend<(${2:transform}<Head<Input>>), Result>>,",
			"    'Return': Reverse<Result>",
			"}[Length<Input> extends Zero ? 'Return' : 'Continue'];"
		],
		"description": "Create a type map"
	}
```

To understand how to build up a type transform like this,
take a look at the [Typescript playground](https://www.typescriptlang.org/play?noImplicitReturns=false&esModuleInterop=false&declaration=false&experimentalDecorators=false&emitDecoratorMetadata=false&target=6&jsx=0&module=5&ts=4.0.2#code/PTAEEEBEDVwOQMIFFKgCoE0AKSDKAudbJdAJXlwDEB5UgWVwChGRQBGAOnQAsBTUAC4BPAA78AhgBsAluIDOjYWPRtQAXlAA7AK4BbAEa8ATgG5mrAExc0fUHIFHtAYwHajvACagPvAGbTNaQFpAHtNRVF+NAt1UABvUGkPQh0DYwAaLXFdXkJ7IwCAc1AAXzMWMABmLgBxXgFgzWKBWyV+EN9QcVARIxCxI2EI5TRK2ISklL1DI0zNbNy7ByLSgG0Acnmc9YBdE1BWNvQxjXyi8zAAFi4EMI8g0PnJBSO0S+6NCeStaYysnLyyyaa3WAl4AA8BABaGRgoxSdagCFgzQeORLArAgD8oE2C0RhHWSV2+0OkXQ71iZyawyil3040S31SMzmC0BmOKJVWbAsY2RvFR6OpxRxeO2oEJxL2BzAr3psRZxguoAArFw6OIANYrIKgSQhEJa-XSLX8JxhBwhSSgXwGgDutPQqsZt00jW0iyVs1ApHqbk0HJW3PWbo9vBJssE5LQLo03pVADYuFh5HIVuJNF0jIU9IKBF1UaB3E43Omwk60ImADxoAB840YoGboDDAU9hCrtbrmVYAHVxAInNxQCFtAWoYI+O51ujNCFBMZdAFB49QEJ6gBCJstv2uIyBn5pIyMEN7gORskjROK34nioQXC4ACqdBIfZIAAlwNASNQcOQaAAJLUHAuDoOI0iSJkn68OIHiZFg7hiKimSZl4AAygqFC0D4fq28D4A+aDgAA0iQ8CgEBaBIHQoCUKQ1B0dQz6kFRcBYM+aCgH21GfqAsHwekD7kUgWDoJ+JCkHg3HUJQoAsWx1G0eBvFoPxaCQZID5QKg6lfkgUDoNQECgBhQG4Nxan8UhvAoR4D4IJJCCkRJJAYUgcA1OpCnyfpZkWVZfFmdhuEPgA7BqIQAG4rEcHiDt0vh9LoVGaCI46CAufpyNokgTj02hyCOYRTvw9jiE4WpOlgRXcNWQHpZlApCqA2iaFq872poqw7JkOV5QWLVom1HVdT1OyxL1DafDuzZtjoiy1cVtZaQ1TUCD2oC2fZ1aCR460ZZt-W8Ll+V1j2c2+v6B6EAN+WnqsWFNC0h3jg2w3ogAWsYC5iueB4EriC2epeYDVlCk42NI6Iw6A3AhPaoD2vwcLLvMYJlcWvClkY5bhA+ABCXG+ngz4YdxFmk7+pC4Cg26sEB8mgRhGA8V+RngDx4Bs2gJnSTTdNUdxhPgC5xlub6QE1J+Vk876LFwJAeHgNRHDqxJ4BoAAROB-ks7zn5AV57OgJAJnfr+KoABxcH6Wz8MtI4CNlvDRcYci8E6fru3jvBvUNkKCiN7WdYjE0nWdgcoiHY3h71U07DN8RXSDiw+x7-uaVBAdbTtwd7XBB2NUdW33Ztl0ttd+6HuXj3PTh9Ul+9SJB61P19KA-03ZoQOhpa7YRnsKoAJzWLYST5kEQiCPCmhyL4IRGKlcMAFZFQWGd+9dvuew5RxAT47rTwHrcx+iofjb1keDWfwcX3H3UJxo02NlXaeEIfU-CKtOfN8d21kIF32rnG+51K67h7ndN2mdqzlzrPXUKTcNofTbiNDuf1cQA17pKYGA9FokhVOADCGFQAYEUuwfAqg0DkDAjQegqkgIkLMtQagrlzLkQkhZB81FdagAAFLPksgFThPJ0gWHSJUHYHBdDiBEAACizGoBsmgACU5RWBsAAAxcHAJIG0RwHCZgXkvXQ6IDRGhNGaKccNJwWONPaac-A6BCCAmCXQaA54mOXokF45IXEYRhgITxxjF7L1Pp9UaYcn59WulHO+rVL7x0mi-JOb8Wwf1AAEoJIT55hN0L-SQoDAF2QLi4txvAPFePyYXeCucy6nUGhdYSVdsHQN3v7eBiCXrINLgk9Bv0u5YJ7n3NOhCnTlPcbk7xBT6yxDQKSMA0NYawyPsEYQtol5dDsEUSQ-AgiVNAJOBwM9hyZkKHFbgMMVRsE4KAZ86ZgQtFRuSIxeTTFOgABqxGyfYaZNTVjekyCKTIz4AgCGtuAIw8IhBJw0SABFiKkXIpRaitF6K0XmAAFRYvQOSWExgpCgAAAZaOJaALFwAnQYNiFojROKeD8G9KOTovA9k5HdLDLM3RXAiD2dGZQlKnQN1etxSJSSYnJzQBsPZPTxnAAZTYfg-g8YFiOAEbZvL+VHCFUcEBYq0EP2iRNKV-T0SrAlZoTI6sOCWt6pNHE0qtGTRSDA0w2LcV6IMZEdEEInB2TVbYFV9gBX7O5YIbQfKXmCqpa8NaBrz5RKvmktQV1WBHxCDCcFUJpCFHnO4LQmaIR8ukE4IIUJMxCCuvI+RNqBCdlUeoBslrG2RJrfWwsQhrXqwEFpQgARfDGFANALRjblFJvDo2rEV0R2SiupoN19LPUeBGt0BdSNDELmefDIuLLNWRu1eSXV5J86omrEgTICb74Tsleoat8iAD6hAL2gBteIHMcgG1NpvWos1oAa1vo-f2zQg6jDDtHd+ltXcZ1aLnVXBZzAgA)