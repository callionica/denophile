import { directoryEntries, fileName } from "./file.ts";
import { arrayFrom } from "./utility.ts";

Deno.test("directoryEntries", async function () {
    const result = await arrayFrom(directoryEntries("/Users/user/Desktop/__current/fs/"));
    console.log(result);
});

Deno.test("name", async function () {
    const result = fileName("/Users/user/Desktop/__current/fs.ext");
    console.log(result);
    console.log(fileName("what"));
    console.log(fileName("/what"));
    console.log(fileName("what a space"));
    console.log(fileName("/what a space/"));
    console.log(fileName("/what%20a space/"));
    console.log(fileName("file:///what a space/"));
    console.log(fileName("file:///what%20a space/"));
});