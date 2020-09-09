# denophile
Deno-related code and documentation #denoland #typescript #rust

## file.ts
file.ts contains a minimal, low-level file API that builds on Deno's built-in file functions. It's not compatible with anything, it just represents the operations that I like to have available for reading files. The most interesting function is readRanges which, given a byte range, returns an iterable that yields the specified byte range from the file and any subsequent ranges of the same size. The functions are defined in terms of Uint8Arrays and allow optimization by the caller providing a (completely optional) buffer. Useful for building a server that handles byte range requests. Another point to note: this API allows you to pass file:// URLs in string form.

