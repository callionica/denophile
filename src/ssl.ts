import { execute, FilePath, toFilePath } from "./file.ts";

export type Certificate = string & { kind_: "Certificate" };
export type Pin = string & { kind_: "Pin" };
export type Subject = Record<string, string | undefined> & { kind_: "Subject" };

function toPort(url: URL) {
    const ports: Record<string, number> = { http: 80, https: 443 };
    const port = url.port || ports[url.protocol] || 443;
    return port;
}

export class SSL {
    exec(pipeline: string[]): Promise<string> {
        return execute("bash", "-c", pipeline.join(" | "));
    }

    /**
     * Returns an object containing the fields of the subject in the specified certificate.
     * Property names are CN, C, O, etc like RFC2253.
     */
    async getSubject(file: FilePath): Promise<Subject> {
        const path = toFilePath(file);
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
    getPin(file: FilePath): Promise<Pin> {
        const path = toFilePath(file);
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