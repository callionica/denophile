import { readFile, readTextFile } from "../../file.ts";
import { MediaGroup, MediaPrimary } from "../../media.ts";

// Also handles audio
export async function pageVideo(mediaGroup: MediaGroup, file: MediaPrimary) {

    const description = await file.description();

    const images = await file.images();
    const image = images[0]?.target; // TODO

    const allSubtitles = await file.subtitles();
    const subtitles = allSubtitles.filter(s => s.extension === "vtt").map(s => ({ url: s.target, mimetype: s.mimetype, language: s.language })); // TODO

    const media = { url: file.target, mimetype: file.mimetype };

    return file.urlName + "\n" + description;
}

// function html_source(vid, baseURL: URL) {
// 	return `<source src="${get_url_relative_to(vid.url, baseURL)}" type="${vid.mimetype}">`;
// }