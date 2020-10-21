import { writeFile } from "../../file.ts";
import { loadEntry } from "../../junction.ts";
import { getMediaGroups, MediaGroup, MediaPrimary } from "../../media.ts";
import { arrayFrom } from "../../utility.ts";
import { pageGroup } from "./page-group.ts";
import { pageGroups } from "./page-groups.ts";
import { pageVideo } from "./page-video.ts";

const entry = await loadEntry("/Volumes/A128/TV.junction");
const mediaEntry = new MediaPrimary(entry);
const all = await arrayFrom(mediaEntry.descendants());
const mediaGroups = await getMediaGroups(all);

const destination = "/Volumes/WD01/_current/_tmp_/";

async function writeVideoPage(mediaGroup: MediaGroup, file: MediaPrimary) {

    const pageLocation = destination + `${mediaGroup.urlName}/${file.urlName}/`;
    await Deno.mkdir(pageLocation, { recursive: true });

    const page = await pageVideo(mediaGroup, file);

    const pageData = new TextEncoder().encode(page);
    await writeFile(pageLocation + "index.html", pageData);
}

{
    const pageLocation = destination;
    console.log(pageLocation);
    await Deno.mkdir(pageLocation, { recursive: true });

    const page = pageGroups(mediaGroups);
    // console.log(page);

    const pageData = new TextEncoder().encode(page);
    await writeFile(pageLocation + "index.html", pageData);
}

for (const mediaGroup of mediaGroups) {

    const pageLocation = destination + mediaGroup.urlName + "/";
    console.log(pageLocation);
    await Deno.mkdir(pageLocation, { recursive: true });

    const page = pageGroup(mediaGroup);
    // console.log(page);

    const pageData = new TextEncoder().encode(page);
    await writeFile(pageLocation + "index.html", pageData);

    for (const file of mediaGroup.files) {
        await writeVideoPage(mediaGroup, file);
    }
}