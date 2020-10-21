import {
    MediaGroup, MediaPrimary,
} from "../../media.ts";

// Also handles audio
export async function pageVideo(mediaGroup: MediaGroup, file: MediaPrimary) {

    const images = await file.images();
    const descriptions = await file.descriptions();
    const subtitles = await file.subtitles();

    return file.urlName;
}

// function html_source(vid, baseURL: URL) {
// 	return `<source src="${get_url_relative_to(vid.url, baseURL)}" type="${vid.mimetype}">`;
// }