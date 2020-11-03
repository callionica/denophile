import { execute, exists, FilePath, rename, toFilePath, toFileURL, writeTextFile } from "./file.ts";

export type Certificate = string & { kind_: "Certificate" };
export type Pin = string & { kind_: "Pin" };
export type Subject = Record<string, string | undefined> & { kind_: "Subject" };

function toPort(url: URL) {
    const ports: Record<string, number> = { http: 80, https: 443 };
    const port = url.port || ports[url.protocol] || 443;
    return port;
}

/**
 * Get a certificate, read the subject from a certificate, get a pin hash from a certificate
 */
export class CertificateUtility {
    exec(pipeline: string[]): Promise<string> {
        return execute("bash", "-c", pipeline.join(" | "));
    }

    /**
     * Returns an object containing the fields of the subject in the specified certificate.
     * Property names are CN, C, O, etc like RFC2253.
     */
    async getSubject(certificateFile: FilePath): Promise<Subject> {
        const path = toFilePath(certificateFile);
        const result = await this.exec([
            `openssl x509 -in  "${path}" -noout -subject -nameopt RFC2253`
        ]);

        const prefix = "subject= ";
        let subject = result.startsWith(prefix) ? result.substring(prefix.length) : result;

        // TODO - can't parse like this!!!
        const commaPlaceholder = "!$comma$!";
        const commaEscaped = "\\,";
        subject = subject.replaceAll(commaEscaped, commaPlaceholder);
        const values = subject.split(",").map(v => v.replace(commaPlaceholder, ","));
        const nameValues = values.map(v => v.split("="));
        return Object.fromEntries(nameValues);
    }

    /** Calculates a hash from the specified certificate to use for pinning */
    getPin(certificateFile: FilePath): Promise<Pin> {
        const path = toFilePath(certificateFile);
        const PUBLIC_KEY_READ = `openssl x509 -pubkey -noout -in "${path}"`;
        const PUBLIC_KEY_TO_DER = `openssl pkey -pubin -outform der`;
        const TO_SHA256 = `openssl dgst -sha256 -binary`;
        const TO_BASE64 = `openssl enc -base64`

        const commands = [
            PUBLIC_KEY_READ,
            PUBLIC_KEY_TO_DER,
            TO_SHA256,
            TO_BASE64
        ];

        return this.exec(commands) as Promise<Pin>;
    }

    /** Returns the certificate from the server specified in the URL - no validation */
    fetchCertificate(url: URL): Promise<Certificate> {
        const DOWNLOAD_CERTIFICATES = `openssl s_client -showcerts -servername ${url.hostname} -connect ${url.hostname}:${toPort(url)} </dev/null 2>/dev/null`;

        const FIRST_CERTIFICATE_TO_PEM = `openssl x509 -outform PEM`;

        const commands = [
            DOWNLOAD_CERTIFICATES,
            FIRST_CERTIFICATE_TO_PEM
        ];

        return this.exec(commands) as Promise<Certificate>;
    }
}

/**
 * Retrieves, stores, and returns server certificates & pin hashes
 */
export class CertificateLibrary {
    folder: URL;
    utility: CertificateUtility;

    constructor(folder: FilePath) {
        this.utility = new CertificateUtility();
        this.folder = toFileURL(folder);
    }

    /** Override to provide custom DNS - for example, switch the hostname for an IP address */
    async toFetchableURL(url: URL): Promise<URL> {
        return url;
    }

    /**
     * Override to provide custom certificate verification.
     * Throw an exception if there are any problems.
     * 
     * This method is called _before_ the certificate is saved to the library.
     * 
     * The default implementation only checks that the common name matches the domain name.
     */
    async verify(certificateFile: FilePath, name: string): Promise<void> {
        const subject = await this.utility.getSubject(certificateFile);
        if (subject.CN !== name) {
            throw new Error(`CN=${subject.CN}, host=${name}`);
        }
    }

    /**
     * Returns the certificate stored in the library for the specified server.
     * 
     * If no certificate is in the library, the following occurs:
     * 1. The URL is converted to a fetchable URL
     * 2. A web request is made to get the certificate
     * 3. The certificate is validated
     * 4. Only if validation succeeds, the certificate is stored in the library
     * 
     * @param url The URL defining the server and name to be expected in the certificate 
     */
    async getCertificate(url: URL): Promise<FilePath> {
        const name = url.hostname;
        const file = new URL(`${name}.pem`, this.folder);
        if (!(await exists(file))) {
            const fetchableURL = await this.toFetchableURL(url);
            const certificate = await this.utility.fetchCertificate(fetchableURL);
            const tempFile = new URL(`${name}.pem.download`, this.folder);
            await writeTextFile(tempFile, certificate);
            await this.verify(tempFile, name);
            await rename(tempFile, file);
        }
        return file;
    }

    async getPin(url: URL): Promise<Pin> {
        const file = await this.getCertificate(url);
        return await this.utility.getPin(file);
    }
}