import { SSL } from "./ssl.ts";


Deno.test("ssl", async function () {
    const ssl = new SSL();

    const cert = await ssl.fetchPin(new URL("https://main-hub.local"));
    // const cert = await ssl.downloadCertificate(new URL("https://main-hub.local"));

    console.log(cert);
});