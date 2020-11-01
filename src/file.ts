// Requires: [Deno]
// Supports: [Typescript]
import { generable } from "./utility.ts";

// Callionica's minimal API for accessing the file system built on top of Deno's built-in, low-level file API
// Scroll past the code for more detailed documentation.

const denoFetch = fetch;

export function fetch(input: Request | URL | string, init?: RequestInit): Promise<Response> {
    const agent = "Mozilla/5.0 (iPad; CPU iPhone OS 12_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1";

    const headers = new Headers(init?.headers || {});
    if (!headers.has("User-Agent")) {
        headers.set("User-Agent", agent);
    }

    const init_ = { ...(init || {}), headers };

    return denoFetch(input, init_);
}

/**
 * Executes an application and returns the output if successful
 * or throws an error on failure.
 * 
 * @param command The application to run
 * @param commandArguments The arguments to provide to the application
 */
export async function execute(command: string, ...commandArguments: string[]): Promise<string> {
    // Use piped to allow us to read the output
    const p = Deno.run({
        cmd: [command, ...commandArguments],
        stdout: "piped",
        stderr: "piped",
    });

    try {
        // Wait for process to finish
        const { success } = await p.status();

        if (!success) {
            const message = new TextDecoder().decode(await p.stderrOutput());
            throw new Error(message);
        }

        // Close stderr if not already closed in the failure case
        p.stderr?.close();

        // Return the output
        return new TextDecoder().decode(await p.output());
    } finally {
        p.close();
    }

}

export async function spawn(command: string, ...commandArguments: string[]): Promise<boolean> {
    const p = Deno.run({
        cmd: [command, ...commandArguments]
    });

    try {
        // Wait for process to finish
        const { success } = await p.status();
        return success;
    } finally {
        p.close();
    }
}

export async function respawn(command: string, ...commandArguments: string[]): Promise<void> {
    while (true) {
        const success = await spawn(command, ...commandArguments);
        if (success) {
            return;
        }
    }
}

export async function cat(input: { source: FilePath, destination: FilePath }) {
    for await (const chunk of readRanges(input.source, { length: 4 * 1024 })) {
        await writeFile(input.destination, chunk, { append: true });
    }
}

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
export function toFileURL(filePath: FilePath): URL {
    if (!(filePath instanceof URL)) {
        if (filePath.startsWith("file://")) {
            return new URL(filePath);
        } else {
            const url = new URL("file://");
            url.pathname = filePath.split("/").map(encodeURIComponent).join("/");
            return url;
        }
    }
    return filePath;
}

/** Converts a URL to a file path */
export function toFilePath(filePath: FilePath): string {
    const url = toFileURL(filePath);
    if (url.protocol != "file:") {
        throw new TypeError("Must be a file URL.");
    }
    return decodeURIComponent(url.pathname);
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

/**
 * Returns true if the path exists in the file system
 * */
export async function exists(filePath: FilePath): Promise<boolean> {
    try {
        await Deno.lstat(adaptFilePath(filePath));
        return true;
    } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
            return false;
        }
        throw e;
    }
}

/**
 * Creates the directory in the file system.
 * @param filePath The directory to make
 */
export async function makeDirectory(filePath: FilePath): Promise<void> {
    return Deno.mkdir(adaptFilePath(filePath), { recursive: true });
}

/** Renames/moves oldPath to newPath */
export async function rename(oldPath: FilePath, newPath: FilePath): Promise<void> {
    return Deno.rename(toFilePath(oldPath), toFilePath(newPath));
}

/** Removes/deletes a file or folder */
export async function remove(filePath: FilePath): Promise<void> {
    return Deno.remove(adaptFilePath(filePath));
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

export async function writeTextFile(filePath: FilePath, data: string, options?: WriteFileOptions | undefined): Promise<void> {
    return writeFile(filePath, new TextEncoder().encode(data), options);
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
export function readRanges(fileOrPath: FileOrPath, range: ByteRange, buffer?: Uint8Array): AsyncIterable<Uint8Array> {
    const start = range.start || 0;
    const length = byteRangeLength(range);

    async function* _readRanges() {
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

    return generable(_readRanges)();
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

/**
 * Reads an entire file if it is smaller than the internal or external buffer.
 * If the file is not smaller than the buffer used, an exception is thrown.
 * 
 * Like readFile except it returns a string.
 */
export async function readTextFile(fileOrPath: FileOrPath, buffer?: Uint8Array): Promise<string> {
    const data = await readFile(fileOrPath, buffer);
    return new TextDecoder().decode(data);
}

/** Returns the file system entries contained in the specified folder */
export function directoryEntries(folderPath: FilePath): AsyncIterable<URL> {
    if (!isFolderPath(folderPath)) {
        throw `directoryEntries failure: folderPath did not end with a slash '${folderPath}'`;
    }

    const url = toFileURL(folderPath);

    async function* _directoryEntries() {
        for await (const child of Deno.readDir(url)) {
            const childURL = new URL(encodeURIComponent(child.name) + (child.isDirectory ? SEPARATOR : ""), url);
            // TODO Deno.readLink doesn't accept URL
            // TODO Need to determine if target is a directory to ensure terminal slash on URL
            // if (child.isSymlink) {
            //     const target = await Deno.readLink(childURL);
            //     yield toFileURL(target);
            // }
            yield childURL;
        }
    }
    return generable(_directoryEntries)();
}

/** The name and extension of a file or folder. */
export interface FileName {
    /** The name of a file or folder without the extension. */
    name: string;

    /**
     * The extension of a file or folder.
     * Does not start with a dot.
     */
    extension?: string;
}

/** A cache of file extensions */
const extensions: string[] = [];

/** The maximum number of file extensions to cache */
const extensionsMaximumLength = 1024;

/**
 * Returns the name/extension of a file path.
 * Folders with periods do not have extensions.
 * Only files have extensions.
 * It's important to indicate folders with a terminating slash.
*/
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

    if (!isFolderPath(filePath)) {
        const dotIndex = name.lastIndexOf(".");
        if (dotIndex >= 0) {
            return {
                name: name.substring(0, dotIndex),
                extension: cache(name.substring(dotIndex + 1))
            };
        }
    }

    return { name };
}

export const MIME_TYPES: Record<string, string> = {
    "xml": "text/xml",
    "htm": "text/html",
    "html": "text/html",
    "css": "text/css",
    "js": "application/javascript",
    "txt": "text/plain",
    "ttml": "application/ttml+xml",
    "vtt": "text/vtt",
    "webvtt": "text/vtt",
    "srt": "text/plain",
    "opml": "text/x-opml",
    "rss": "application/rss+xml",
    "atom": "application/atom+xml",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "ts": "video/mp2t",
    "mp2": "video/mpeg",
    "mp2v": "video/mpeg",
    "mp4": "video/mp4",
    "mp4v": "video/mp4",
    "m4v": "video/x-m4v",
    "mp3": "audio/mpeg",
    "m4a": "audio/m4a",
    "m3u": "audio/x-mpegurl",
    "m3u8": "audio/x-mpegurl",
};

export const MIME_EXTENSIONS: Record<string, string> = {
    "text/xml": "xml",
    "text/html": "html",
    "text/css": "css",
    "application/javascript": "js",
    "text/plain": "txt",
    "application/ttml+xml": "ttml",
    "text/vtt": "vtt",
    "text/x-opml": "opml",
    "application/rss+xml": "rss",
    "application/atom+xml": "atom",
    "image/jpeg": "jpg",
    "image/png": "png",
    "video/mp2t": "ts",
    "video/mpeg": "mp2",
    "video/mp4": "mp4",
    "video/x-m4v": "m4v",
    "audio/mpeg": "mp3",
    "audio/m4a": "m4a",
    "audio/x-mpegurl": "m3u8",
};


const mimeFromContentTypeRE = /^\s*(?<mime>[^;\s]*)(?:;|\s|$)/;

function getMimeType(response: Response): string | undefined {
    const contentType = response.headers.get('Content-Type');
    if (contentType) {
        return mimeFromContentTypeRE.exec(contentType)?.groups?.mime;
    }
}

/**
 * Fetches a file from a URL, writes it to a file named `name.extension.download`
 * and when the file is completely written, renames the local file to `name.extension`.
 * 
 * By default the file extension is calculated from the Content-Type header provided
 * by the file server. You can force a specific extension to be used by setting `options`
 * to `{ extensionFromContentType: false }`.
 * 
 * Returns the file:// URL of the local destination file.
 * 
 * @param url The URL to fetch
 * @param folderPath The folder in which to write the downloaded file
 * @param name The name to use for the downloaded file
 * @param extension The fallback extension or the specified extension for the downloaded file
 * @param options Allows you to control whether the file extension is derived from the Content-Type of the file provided by the server.
 */
export async function fetchToFile(
    url: URL | string,
    folderPath: FilePath, name: string, extension: string,
    options: { extensionFromContentType: boolean } = { extensionFromContentType: true }
): Promise<URL> {

    const response = await fetch(url);
    let ext = extension;
    if (options.extensionFromContentType) {
        const mimeType = getMimeType(response);
        ext = (mimeType && MIME_EXTENSIONS[mimeType]) || extension;
    }

    // TODO - assuming small files here
    const data = new Uint8Array(await response.arrayBuffer());

    const location = toFileURL(folderPath);

    // Write to a temporary file
    const tempPath = new URL(`${name}.${ext}.download`, location);
    await writeFile(tempPath, data);

    // Once all data written, rename the file
    const filePath = new URL(`${name}.${ext}`, location);
    await Deno.rename(toFilePath(tempPath), toFilePath(filePath));

    return filePath;
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