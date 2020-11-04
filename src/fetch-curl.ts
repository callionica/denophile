// A comical implementation of a small part of the fetch API built on top of curl
// Currently will leak disk space!!!! Hard-coded directories!!!! Success-oriented coding!!!!

import { FilePath, execute, toFilePath, toFileURL, readTextFile, exists, writeTextFile, rename } from "./file.ts";
import { PublicKeyHash, CertificateUtility, CertificateLibrary, Certificate } from "./ssl.ts";

const cacheFolder = toFileURL("/Users/user/Desktop/__current/"); // TODO

type IPAddress = string;

type DynamicNameResolver = { resolve(name: string): Promise<IPAddress | undefined> };
type NameResolver = Record<string, IPAddress> | DynamicNameResolver;

function isDynamicNameResolver(x: unknown): x is DynamicNameResolver {
    return (x as DynamicNameResolver).resolve !== undefined; // TODO
}

type HttpClient = {
    caFile?: string,
    skipVerifyingCertificateChain?: boolean,
    nameResolver?: NameResolver;
    pinningLibrary?: CertificateLibrary;
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

        const pin = await options?.client?.pinningLibrary?.getPublicKeyHash(url);
        const pins = (pin !== undefined) ? [pin] : [];
        const pinArgs = (pins.length === 0) ? [] : ["--pinnedpubkey", pins.map(pin => `sha256//${pin}`).join(";")];

        const METHOD: Record<string, string[]> = {
            GET: ["--get"],
            HEAD: ["--head"],
            POST: ["-d", options?.body || ""],
        };

        const methodArgs = METHOD[options?.method || "GET"] || ["-X", options!.method];

        const WRITE_EXTENDED_ATTRIBUTES = "--xattr";
        const FOLLOW_REDIRECTS = "-L";
        const SKIP_VERIFYING_CERTIFICATE_CHAIN = "--insecure";

        const flags: string[] = options?.client?.skipVerifyingCertificateChain ? [
            SKIP_VERIFYING_CERTIFICATE_CHAIN
        ] : [];

        if (flags.includes(SKIP_VERIFYING_CERTIFICATE_CHAIN)) {
            console.log("WARNING: Skipping verifying certificate chain (--insecure)");
        }

        let resolveArgs: string[] = [];
        if (options?.client?.nameResolver) {
            const nameResolver = options.client.nameResolver;
            const name = url.hostname;
            const ports: Record<string, number> = { http: 80, https: 443 };
            const port = url.port || ports[url.protocol] || 443;

            if (isDynamicNameResolver(nameResolver)) {
                // TODO - dynamic resolver only gets to see the first name
                const ip = await nameResolver.resolve(name);
                if (ip !== undefined) {
                    resolveArgs = ["--resolve", `${name}:${port}:${ip}`];
                }
            } else {
                resolveArgs = Object.entries(nameResolver).flatMap(([name, ip]) => [
                    "--resolve", `${name}:${port}:${ip}`
                ]);
            }
        }

        const certificateArgs = (options?.client?.caFile !== undefined) ? ["--cacert", options.client.caFile] : [];

        await execute(
            "curl",
            ...methodArgs,
            WRITE_EXTENDED_ATTRIBUTES,
            FOLLOW_REDIRECTS,
            ...certificateArgs,
            ...pinArgs,
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

    const unique = await execute("uuidgen");
    const bodyURL = new URL(unique + "-body.txt", cacheFolder);
    const headerURL = new URL(unique + "-header.txt", cacheFolder);
    const responseURL = await downloadFile(requestURL, bodyURL, headerURL);
    return new Response(requestURL, responseURL, bodyURL, headerURL);
}