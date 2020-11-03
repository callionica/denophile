import { execute, FilePath, toFilePath } from "./file.ts";

export type Certificate = string & { kind_: "Certificate" };
export type Pin = string & { kind_: "Pin" };

function toPort(url: URL) {
    const ports: Record<string, number> = { http: 80, https: 443 };
    const port = url.port || ports[url.protocol] || 443;
    return port;
}

export class SSL {
    exec(pipeline: string[]): Promise<string> {
        return execute("bash", "-c", pipeline.join(" | "));
    }

    async getSubject(file: FilePath): Promise<Record<string, string | undefined>> {
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

    /**
     * Returns a hash of the server's public key
     * @param url The URL from which to download and calculate the public key hash 
     */
    fetchPin(url: URL): Promise<Pin> {
        const DOWNLOAD_CERTIFICATE = `openssl s_client -servername ${url.hostname} -connect ${url.hostname}:${toPort(url)}`;
        const PUBLIC_KEY_READ = `openssl x509 -pubkey -noout`;
        const PUBLIC_KEY_TO_DER = `openssl pkey -pubin -outform der`;
        const TO_SHA256 = `openssl dgst -sha256 -binary`;
        const TO_BASE64 = `openssl enc -base64`

        const commands = [
            DOWNLOAD_CERTIFICATE,
            PUBLIC_KEY_READ,
            PUBLIC_KEY_TO_DER,
            TO_SHA256,
            TO_BASE64
        ];

        return this.exec(commands) as Promise<Pin>;
    }

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