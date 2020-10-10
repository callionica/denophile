import { directoryEntries, fileName, toFileURL } from "./file.ts";
import { arrayFrom } from "./utility.ts";

Deno.test("directoryEntries", async function () {
    const d = "/Volumes/C430/TV/Would I Lie to You?/";
    console.log(d);

    const u = toFileURL(d);
    console.log(u.pathname, u);

    const result = await arrayFrom(directoryEntries(d));
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

