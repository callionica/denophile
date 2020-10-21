import {
    MEDIA_EXTENSIONS, SUBTITLE_EXTENSIONS,
    MediaGroup, MediaPrimary,
} from "../../media.ts";

// Also handles audio
export async function pageVideo(mediaGroup: MediaGroup, file: MediaPrimary) {

    const images = file.images();

    const satellites = await file.satellites();
    const media = satellites.filter(s => (s.extension !== undefined) && MEDIA_EXTENSIONS.includes(s.extension));
    const subtitles = satellites.filter(s => (s.extension !== undefined) && SUBTITLE_EXTENSIONS.includes(s.extension));

    return file.urlName;
}

// function html_source(vid, baseURL: URL) {
// 	return `<source src="${get_url_relative_to(vid.url, baseURL)}" type="${vid.mimetype}">`;
// }