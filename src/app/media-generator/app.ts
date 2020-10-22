import { writeTextFile, FilePath, toFileURL } from "../../file.ts";
import { srt2vtt, ttml2vtt } from "../../subtitle.ts";
import { loadEntry } from "../../junction.ts";
import { getMediaGroups, MediaGroup, MediaPrimary } from "../../media.ts";
import { arrayFrom } from "../../utility.ts";
import { pageGroup } from "./page-group.ts";
import { pageGroups } from "./page-groups.ts";
import { pageVideo } from "./page-video.ts";
import { MIME_TYPES, Satellite } from "../../satellite.ts";

const entry = await loadEntry("/Volumes/A128/TV.junction");
const mediaEntry = new MediaPrimary(entry);
const all = await arrayFrom(mediaEntry.descendants());
const mediaGroups = await getMediaGroups(all);

const destination = "/Volumes/WD01/_current/_tmp_/";

async function getOrConvertWebVTTs(primary: MediaPrimary, destinationFolder: FilePath) {
    function isWebVTT(satellite: { extension: string | undefined }): boolean {
        const ext = satellite.extension;
        return (ext !== undefined) && ["vtt", "webvtt"].includes(ext.toLowerCase());
    }

    const subtitles = await primary.subtitles();

    let webVTTs = subtitles.filter(isWebVTT).map(s =>
        ({ url: s.target, mimetype: s.mimetype, language: s.language })
    );

    if (webVTTs.length === 0) {
        const dest = toFileURL(destinationFolder);
        const notVTT = subtitles.filter(s => !isWebVTT(s));
        webVTTs = await Promise.all(notVTT.map(async (s) => {
            const path = new URL(`${s.name}.${s.extension}.vtt`, dest);
            const convert = (s.extension === "ttml") ? ttml2vtt : srt2vtt;
            const converted = convert(await s.text());
            await writeTextFile(path, converted);
            return { url: path, mimetype: MIME_TYPES.vtt, language: s.language };
        }));
    }

    return webVTTs;
}

async function writeVideoPage(mediaGroup: MediaGroup, file: MediaPrimary) {

    const pageLocation = destination + `${mediaGroup.urlName}/${file.urlName}/`;
    await Deno.mkdir(pageLocation, { recursive: true });

    const subtitles = await getOrConvertWebVTTs(file, pageLocation);

    const page = await pageVideo(mediaGroup, file, subtitles);

    await writeTextFile(pageLocation + "index.html", page);
}

{
    const pageLocation = destination;
    console.log(pageLocation);
    await Deno.mkdir(pageLocation, { recursive: true });

    const page = pageGroups(mediaGroups);
    // console.log(page);

    await writeTextFile(pageLocation + "index.html", page);
}

for (const mediaGroup of mediaGroups) {

    const pageLocation = destination + mediaGroup.urlName + "/";
    console.log(pageLocation);
    await Deno.mkdir(pageLocation, { recursive: true });

    const page = pageGroup(mediaGroup);
    // console.log(page);

    await writeTextFile(pageLocation + "index.html", page);

    for (const file of mediaGroup.files) {
        await writeVideoPage(mediaGroup, file);
    }
}