// A comical implementation of a small part of the fetch API built on top of curl
// Currently will leak disk space!!!! Hard-coded directories!!!! Success-oriented coding!!!!

import { FilePath, execute, toFilePath, toFileURL, readTextFile } from "./file.ts";

const cacheFolder = toFileURL("/Users/user/Desktop/__current/"); // TODO

type IPAddress = string;

type DynamicNameResolver = { resolve(name: string): IPAddress };
type NameResolver = Record<string, IPAddress> | DynamicNameResolver;

function isDynamicNameResolver(x: unknown): x is DynamicNameResolver {
    // deno-lint-ignore no-explicit-any
    return (x as any).resolve !== undefined; // TODO
}

// type ResolvedName = {
//     name: string,
//     port?: number, // defaults to 443
//     ip: string
// };

type HttpClient = {
    caFile?: string,
    nameResolver?: NameResolver;
};

class Response {
    requestURL: URL;
    responseURL: URL;
    bodyURL: URL;
    headerURL: URL;

    constructor(requestURL: URL, responseURL: URL, bodyURL: URL, headerURL: URL) {
        this.requestURL = requestURL;
        this.responseURL = responseURL;
        this.bodyURL = bodyURL;
        this.headerURL = headerURL;
    }

    text(): Promise<string> {
        return readTextFile(this.bodyURL); // TODO - size limited
    }

    // deno-lint-ignore no-explicit-any
    async json(): Promise<any> {
        return JSON.parse(await this.text());
    }
}

export async function fetch(url: URL | string, options?: { method?: string, body?: string, client?: HttpClient }): Promise<Response> {
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
    async function downloadFile(url: URL, destinationBody: URL, destinationHeader: URL): Promise<URL> {
        // -L tells curl to follow redirects
        // -A tells curl what user agent header to send
        // -o tells curl where to output the data
        // --xattr writes metadata to the file as extended attributes - includes the final location after following redirects
        const agent = "Mozilla/5.0 (iPad; CPU iPhone OS 12_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1";

        const METHOD: Record<string, string[]> = {
            GET: ["--get"],
            HEAD: ["--head"],
            POST: ["-d", options?.body || ""],
        };

        const methodArgs = METHOD[options?.method || "GET"] || ["-X", options!.method];

        const WRITE_EXTENDED_ATTRIBUTES = "--xattr";
        const FOLLOW_REDIRECTS = "-L";
        const SKIP_CERTIFICATE_CHECKS = "--insecure";

        const flags: string[] = [
            SKIP_CERTIFICATE_CHECKS
        ];

        if (flags.includes(SKIP_CERTIFICATE_CHECKS)) {
            console.log("WARNING: Skipping certificate checks");
        }

        let resolveArgs: string[] = [];
        if (options?.client?.nameResolver) {
            const nameResolver = options.client.nameResolver;
            const name = url.hostname;
            const ip = isDynamicNameResolver(nameResolver) ? nameResolver.resolve(name) : nameResolver[name];
            const ports: Record<string, number> = { http: 80, https: 443 };
            const port = url.port || ports[url.protocol] || 443;
            if (ip !== undefined) {
                resolveArgs = ["--resolve", `${name}:${port}:${ip}`];
            }
        }

        // const resolveArgs = (
        //     options?.client?.resolvedNames?.flatMap(rn => [
        //         "--resolve", `${rn.name}:${rn.port || 443}:${rn.ip}`
        //     ])) || [];

        const certificateArgs = (options?.client?.caFile !== undefined) ? ["--cacert", options.client.caFile] : [];

        await execute(
            "curl",
            ...methodArgs,
            WRITE_EXTENDED_ATTRIBUTES,
            FOLLOW_REDIRECTS,
            ...certificateArgs,
            ...resolveArgs,
            ...flags,
            "-A", agent,
            "--create-dirs",
            "-o", toFilePath(destinationBody),
            "--dump-header", toFilePath(destinationHeader),
            url.toString()
        );

        const location = await readExtendedAttribute("user.xdg.origin.url", destinationBody);
        return new URL(location);
    }

    const bodyURL = new URL(await execute("uuidgen"), cacheFolder);
    const headerURL = new URL(await execute("uuidgen"), cacheFolder);
    const responseURL = await downloadFile(requestURL, bodyURL, headerURL);
    return new Response(requestURL, responseURL, bodyURL, headerURL);
}