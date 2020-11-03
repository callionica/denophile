import { writeTextFile } from "./file.ts";
import { SSL } from "./ssl.ts";


Deno.test("ssl", async function () {
    console.log("");

    const ssl = new SSL();

    const cert = await ssl.fetchCertificate(new URL("https://main-hub.local"));

    const fn = "/Users/user/Desktop/__current/--1--1--dump.txt";
    await writeTextFile(fn, cert);

    const pin = await ssl.getPin(fn);

    const subject = await ssl.getSubject(fn);

    console.log(subject);
    console.log(subject.CN);
    console.log(cert);
    console.log(pin);

    if (pin != "KCeZkuOUT+zijAND9jsWsIZk3NXdYs7jmm3U+T2J0Q4=") {
        throw "FAIL";
    }
});