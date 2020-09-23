// Requires: [Deno]
// Supports: [Typescript]

// Callionica's minimal API for accessing the file system built on top of Deno's built-in, low-level file API
// Scroll past the code for more detailed documentation.

/** A file in the file system */
export interface File { _type: 'File'; }

function isFile(value: unknown): value is File {
    // Underneath our opaque file is a Deno.File
    return (value instanceof Deno.File);
}

type RID = number & { _type: 'RID'; };

function rid(file: File): RID {
    return (file as unknown as Deno.File).rid as RID;
}

/** A file system path or a file:// URL */
export type FilePath = string | URL;

/** A file, a file system path, or a file:// URL */
export type FileOrPath = File | FilePath;

function adaptFilePath(filePath: FilePath): FilePath {
    // Deno doesn't handle URLs that are in string form
    // so we'll do it before giving the URL to Deno
    if (!(filePath instanceof URL)) {
        if (filePath.startsWith("file://")) {
            return new URL(filePath);
        }
    }
    return filePath;
}

/** Converts a file path to a file URL */
export function toFileURL(filePath: FilePath) : URL {
    if (!(filePath instanceof URL)) {
        if (filePath.startsWith("file://")) {
            return new URL(filePath);
        } else {
            return new URL("file://" + filePath);
        }
    }
    return filePath;
}

const SEPARATOR = "/";

/**
 * Returns true if the path ends with "/".
 * Does not access the file system.
 * */
export function isFolderPath(filePath: FilePath): boolean {
    if (filePath instanceof URL) {
        return filePath.href.endsWith(SEPARATOR);
    }
    return filePath.endsWith(SEPARATOR);
}

/** Opens a file */
export async function open(filePath: FilePath): Promise<File> {
    return await Deno.open(adaptFilePath(filePath)) as unknown as File;
}

/** Closes an open file */
export function close(file: File): void {
    // Hide RID from outside world
    Deno.close(rid(file));
}

/** Holds a file and a boolean indicating whether to close the file when dispose is called */
class FileHolder {
    file: File;
    close: boolean;

    constructor(file: File, close: boolean) {
        this.file = file;
        this.close = close;
    }

    dispose() {
        if (this.close) {
            close(this.file);
        }
    }

    // If we get a File, we don't want to close it
    // If we get a URL or path, we want to open the File and close it when done
    static async create(fileOrPath: FileOrPath) {
        if (isFile(fileOrPath)) {
            return new FileHolder(fileOrPath, false);
        } else {
            const file = await open(fileOrPath);
            return new FileHolder(file, true);
        }
    }
}

type ByteRangeWithEnd = { start?: number, end: number };
type ByteRangeWithLength = { start?: number, length: number };

/** A byte range describes a section of a file or array */
export type ByteRange = { start: number } | ByteRangeWithEnd | ByteRangeWithLength;

/** The default length of a byte range is 4MB */
export const ByteRangeDefaultLength = (4 * 1024 * 1024); // 4 MB default

function byteRangeHasEnd(range: ByteRange): range is ByteRangeWithEnd {
    return (range as ByteRangeWithEnd).end !== undefined;
}

function byteRangeHasLength(range: ByteRange): range is ByteRangeWithLength {
    return (range as ByteRangeWithLength).length !== undefined;
}

function byteRangeLength(range: ByteRange): number {
    if (byteRangeHasLength(range)) {
        return range.length;
    }

    if (byteRangeHasEnd(range)) {
        return range.end - (range.start || 0);
    }

    return ByteRangeDefaultLength;
}

function byteRangeEnd(range: ByteRange): number {
    if (byteRangeHasEnd(range)) {
        return range.end;
    }

    if (byteRangeHasLength(range)) {
        return (range.start || 0) + range.length;
    }

    return (range.start || 0) + ByteRangeDefaultLength;
}

export type WriteFileOptions = Deno.WriteFileOptions;

/** Writes data to a file */
export async function writeFile(filePath: FilePath, data: Uint8Array, options?: WriteFileOptions | undefined): Promise<void> {
    return await Deno.writeFile(adaptFilePath(filePath), data, options);
}

// Deno.read does not guarantee it will read the requested length even if the file is large enough,
// so readFull implements the loop that fills the provided buffer as far as possible
async function readFull(rid: RID, buffer: Uint8Array): Promise<number> {
    let totalBytesRead = 0;
    let workingBuffer = buffer;

    let zeroReadCount = 0;
    const zeroReadLimit = 16;

    while (true) {
        const bytesRead = await Deno.read(rid, workingBuffer);
        if (bytesRead !== null) {
            if (bytesRead === 0) {
                ++zeroReadCount;
                if (zeroReadCount > zeroReadLimit) {
                    throw "readFull failure: Deno.read keeps returning zero length data without error.";
                }
            } else {
                zeroReadCount = 0;
            }
            totalBytesRead += bytesRead;
            if (totalBytesRead >= buffer.length) {
                // We've read all the data requested
                // We should expect totalBytesRead === buffer.length here but we won't check it explicitly
                break;
            }
            workingBuffer = workingBuffer.subarray(bytesRead);
        } else {
            // EOF
            break;
        }
    }
    return totalBytesRead;
}

// The buffer argument can be used as an optimization at caller's discretion.
// If a buffer is supplied that is smaller than the requested range, there is no exception.
// Instead the function just creates a buffer large enough to hold the entire range and the 
// caller's buffer is not used.
// If a suitable buffer is supplied, the function writes to the buffer starting at 0 up to the maximum size of the range
// If a suitable buffer is supplied, the return value is a subarray of the passed in buffer
async function _readRange(rid: RID, range: ByteRange, buffer?: Uint8Array): Promise<Uint8Array> {
    const start = range.start || 0;
    const length = byteRangeLength(range);
    const result = (buffer && buffer.length >= length) ? buffer.subarray(0, length) : new Uint8Array(length);
    const position = await Deno.seek(rid, start, Deno.SeekMode.Start);
    const bytesRead = await readFull(rid, result);
    return result.subarray(0, bytesRead);
}

/**
 * Reads the specified byte range from the file.
 * 
 * If range.start isn't specified, reads from the start of the file.
 * 
 * If range.end isn't specified, reads up to 4 MB of data.
 * 
 * If the requested range exceeds the size of the file, returns only the available data without error.
 * 
 * If you intend to read a whole file, use readRanges or readFile instead.
 * 
 * @param fileOrPath - A file, file:// URL, or file path
 * @param range - The byte range to read from the file
 * @param buffer - An optional buffer to be used for reading the data if the buffer is large enough.
 *  If a buffer is not supplied or if it is too small, the function will allocate an internal buffer
 *  that matches the length of the range.
 * 
 * @return - Returns the requested byte range from the file or a smaller amount of data
 *  if the range exceeds the length of the file. The returned array is a view on to the provided
 *  buffer if it was provided and used.
 * */
export async function readRange(fileOrPath: FileOrPath, range: ByteRange, buffer?: Uint8Array): Promise<Uint8Array> {
    const fileHolder = await FileHolder.create(fileOrPath);
    try {
        return await _readRange(rid(fileHolder.file), range, buffer);
    } finally {
        fileHolder.dispose();
    }
}

/**
 * Reads chunks of data from a file starting with the specified range
 * and continuing with chunks of the same size immediately following the previous chunk.
 * 
 * Each chunk will be the same length as the range until the last chunk in the file which may be smaller.
 * 
 * Each chunk returned by the iterator is an independent copy that does not refer to the buffer.
 * 
 * @param fileOrPath - A file, file:// URL, or file path
 * @param range - The byte range to read from the file
 * @param buffer - An optional buffer to be used for reading the data if the buffer is large enough.
 *  If a buffer is not supplied or if it is too small, the function will allocate an internal buffer
 *  that matches the length of the range. The buffer is only used to hold a single chunk.
 */
export async function* readRanges(fileOrPath: FileOrPath, range: ByteRange, buffer?: Uint8Array) {
    const start = range.start || 0;
    const length = byteRangeLength(range);
    const workingBuffer = (buffer && buffer.length >= length)
        ? buffer.subarray(0, length)
        : new Uint8Array(length);
    const fileHolder = await FileHolder.create(fileOrPath);
    try {
        const id = rid(fileHolder.file);
        const position = await Deno.seek(id, start, Deno.SeekMode.Start);
        while (true) {
            const bytesRead = await readFull(id, workingBuffer);
            const final = (bytesRead < workingBuffer.length);
            if (bytesRead > 0) {
                // Copy the data to return it to the caller
                // because we're still using the buffer
                yield workingBuffer.slice(0, bytesRead);
            }
            if (final) {
                // We've read all the data
                return;
            }
        }
    } finally {
        fileHolder.dispose();
    }
}

/**
 * Reads an entire file if it is smaller than the internal or external buffer.
 * If the file is not smaller than the buffer used, an exception is thrown.
 * 
 * The internal buffer is 4 MB and is used if no external buffer is supplied.
 * The external buffer is optionally allocated and provided by the caller.
 * 
 * This function is suitable for reading small files of predictable size.
 * For reading large files, use readRanges instead.
 * 
 * @param fileOrPath - A file, file:// URL, or file path
 * @param buffer - An optional buffer to be used for reading the data
 * 
 * @return - Returns the entire contents of the file if the internal or external buffer
 *  is large enough to hold it. Otherwise, an exception is thrown.
 */
export async function readFile(fileOrPath: FileOrPath, buffer?: Uint8Array): Promise<Uint8Array> {
    const length = (buffer ? buffer.length : ByteRangeDefaultLength);
    const result = await readRange(fileOrPath, { start: 0, length }, buffer);
    if (result.length >= length) {
        throw `File is not less than ${length} bytes, so unable to retrieve the whole file.`;
    }
    return result;
}

/** Returns the file system entries contained in the specified folder */
export async function* directoryEntries(folderPath: FilePath) : AsyncIterable<URL> {
    if (!isFolderPath(folderPath)) {
        throw `directoryEntries failure: folderPath did not end with a slash '${folderPath}'`;
    }

    const url = toFileURL(folderPath);

    for await (const child of Deno.readDir(url)) {
        const childURL = new URL(child.name + (child.isDirectory ? SEPARATOR : ""), url);
        // TODO Deno.readLink doesn't accept URL
        // TODO Need to determine if target is a directory to ensure terminal slash on URL
        // if (child.isSymlink) {
        //     const target = await Deno.readLink(childURL);
        //     yield toFileURL(target);
        // }
        yield childURL;
    }
}

export interface FileName {
    name: string;
    extension?: string; // Does not start with a dot
}

/** A cache of file extensions */
const extensions: string[] = [];

/** The maximum number of file extensions to cache */
const extensionsMaximumLength = 1024;

/** Returns the name/extension of a file path */
export function fileName(filePath: FilePath): FileName {

    // Extensions are shared by many files, so cache and reuse them to reduce memory
    function cache(extension: string): string {
        const found = extensions.find(ext => ext === extension);
        if (found) {
            return found;
        }

        if (extensions.length < extensionsMaximumLength) {
            extensions.push(extension);
        }

        return extension;
    }

    // Make URLs be URL objects
    filePath = adaptFilePath(filePath);

    const decode = (filePath instanceof URL) ? decodeURIComponent : (x: string) => x;
    const path = (filePath instanceof URL) ? filePath.href : filePath;
    const last = path.endsWith(SEPARATOR) ? path.length - 2 : path.length - 1;
    const slashIndex = path.lastIndexOf(SEPARATOR, last);
    const name = decode(path.substring(slashIndex + 1, last + 1));

    const dotIndex = name.lastIndexOf(".");
    if (dotIndex >= 0) {
        return {
            name: name.substring(0, dotIndex),
            extension: cache(name.substring(dotIndex + 1))
        };
    }

    return { name };
}

// NOTES

// When you see FileOrPath, you can pass an open File, a file:// URL, or a file path or file:// URL as a string.
// If you are going to call the same function multiple times, passing a File directly
// rather then a string or URL representation is going to be more efficient.

// When you see FilePath, you can pass a file:// URL or a file path or file:// URL as a string.

// When you see ByteRange, you can specify start and end/length (or just one of them).
// If you don't specify a length or end for a ByteRange, you will get a 4 MB range.
// This is to prevent accidents that read huge files or consume all available memory
// and to avoid hitting the disk to read the file length if it's not necessary.

// When you see an optional Uint8Array parameter called buffer, you can pass your own array
// as an optimization or you can omit the argument and let the function create a buffer for you.
// If the buffer you supply is not large enough for its intended use, the function will create its own
// buffer anyway.
// If the return value of the function is a Uint8Array, the return value will be a view on the buffer
// you passed in unless otherwise documented.
// The returned Uint8Array that reuses the buffer will be the correct size for the valid data, but it will 
// be created using Uint8Array.subarray, so it will hold on to the entire buffer you passed in.
// Similarly if you omit the buffer argument, a buffer will be created internally that is sized based on 
// input arguments and then the final result will be a view on potentially a smaller part of the buffer.
//
// You can manage your buffers and views, check sizes, or release data using a combination of
// Uint8Array.buffer, Uint8Array.slice, and Uint8Array.subarray.

// Note that none of the functions in this file ask the file system for a file length
// separately from reading data. The functions are just designed to read the data and
// deal with whatever is there at the time.

// We use opaque files so there's one obvious way to do things.

// We're strict about terminating file paths and URLs that represent folders with a slash
// so you can test whether a file path represents a folder by looking for a terminal slash.

// FAQ

// Q1. Doesn't treating "file://"-prefixed strings as URLs get in the way of file system paths?
// A1. Hardly at all. Multiple slashes in a file system path are equivalent to a single slash, so if you have
// an oddly named directory, just use a path that contains only single slashes to get to it.

// Q2. Why don't the functions that take a buffer also take offsets within the buffer?
// A2. Parameters for offsets within a buffer are unecessary. All buffer parameters are typed as Uint8Array.
// It is easy to create another Uint8Array that captures the offset you'd like to use 
// by calling array.subarray(offset, ...).
// subarray creates a view without allocating a new buffer, so you can create a view
// on the existing buffer before calling the file functions.
// There's no need to add parameters for buffer offsets because Uint8Array already provides that feature.

// Q3. I don't see any synchronous version of these functions.
// A3. That's right. This library provides async-only functions.

// Q4. How do I read the entire content of a file?
// A4. If you know the upper bound for the size of the file, you can use readFile.
// If you don't have an upper bound on the size of the file, use readRanges.

// Q5. writeFile doesn't take a FileOrPath so you can't pass a File. What's up with that?
// A5. That's an inconsistency that we should address, but it is what it is right now. If you find it
// limiting, you can fall back to using Deno functions directly.

// Q6. Why does readFile with no arguments only read files that are strictly less than 4 MB?
// A6. Reading large files into memory without thinking about it is a pretty common cause of 
// performance issues. It's nice to be able to read a file with readFile(file), but not so nice
// that we allow reading files of any size that way. 4 MB is our limit.
// If you want to read a larger file, you can either call readFile with an explicitly sized buffer
// or you can call readRanges to read the file one chunk at a time.

// Q7. I've got a 4 MB file and readFile throws an exception. What's up with that?
// A7. readFile will throw an exception for any file 4 MB or above if you use the default buffer.

// Q8. Why is 4 MB the default size for readFile's default buffer (and for ranges where a
// length has not been provided)?
// A8. 5 minutes of thought and 20 years of experience went into deciding that 4MB is the right size.
// If you have a better suggestion and can show why it's better, let me know.