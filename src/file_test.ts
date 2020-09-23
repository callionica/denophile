import { directoryEntries } from "./file.ts";
import { arrayFrom } from "./utility.ts";

Deno.test("directoryEntries", async function () {
    const result = await arrayFrom(directoryEntries("/Users/user/Desktop/__current/fs/"));
    console.log(result);
});