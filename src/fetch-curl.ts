// A comical implementation of a small part of the fetch API built on top of curl
// Currently will leak disk space!!!! Hard-coded directories!!!! Success-oriented coding!!!!

import { FilePath, execute, toFilePath, toFileURL, readTextFile } from "./file.ts";

const cache = toFileURL("/Users/user/Desktop/__current"); // TODO

class Response {
    requestURL: URL;
    responseURL: URL;
    localURL: URL;

    constructor(requestURL: URL, responseURL: URL, localURL: URL) {
        this.requestURL = requestURL;
        this.responseURL = responseURL;
        this.localURL = localURL;
    }

    text(): Promise<string> {
        return readTextFile(this.localURL); // TODO - size limited
    }

    // deno-lint-ignore no-explicit-any
    async json(): Promise<any> {
        return JSON.parse(await this.text());
    }
}

export async function fetch(url: URL | string): Promise<Response> {
    const requestURL = (url instanceof URL) ? url : new URL(url);

    async function readExtendedAttribute(attribute: string, source: FilePath): Promise<string> {
        const filePath = toFilePath(source);
        return execute(
            "xattr",
            "-p",
            attribute,
            filePath
        );
    }

    /**
     * Download a URL to a specified file and return the resolved URL after following redirects
     */
    async function downloadFile(url: URL, destination: URL): Promise<URL> {
        // -L tells curl to follow redirects
        // -A tells curl what user agent header to send
        // -o tells curl where to output the data
        // --xattr writes metadata to the file as extended attributes - includes the final location after following redirects
        const agent = "Mozilla/5.0 (iPad; CPU iPhone OS 12_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1";

        const WRITE_EXTENDED_ATTRIBUTES = "--xattr";
        const FOLLOW_REDIRECTS = "-L";
        const SKIP_CERTIFICATE_CHECKS = "--insecure";
        
        const flags = [
            SKIP_CERTIFICATE_CHECKS
        ];

        if (flags.includes(SKIP_CERTIFICATE_CHECKS)) {
            console.log("WARNING: Skipping certificate checks");
        }

        await execute(
            "curl",
            WRITE_EXTENDED_ATTRIBUTES,
            FOLLOW_REDIRECTS,
            "-A", agent,
            "-o", toFilePath(destination),
            // "--cacert", "/Users/user/Documents/github/hue/hue.pem", // TODO
            ...flags,
            url.toString()
        );

        const location = await readExtendedAttribute("user.xdg.origin.url", destination);
        return new URL(location);
    }

    const unique = await execute("uuidgen");
    const localURL = new URL(unique, cache);
    const responseURL = await downloadFile(requestURL, localURL);
    return new Response(requestURL, responseURL, localURL);
}