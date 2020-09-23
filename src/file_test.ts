import { directoryEntries, fileName } from "./file.ts";
import { arrayFrom } from "./utility.ts";

Deno.test("directoryEntries", async function () {
    const result = await arrayFrom(directoryEntries("/Users/user/Desktop/__current/fs/"));
    console.log(result);
});

Deno.test("name", async function () {
    const result = fileName("/Users/user/Desktop/__current/fs.ext");
    console.log(result);
});