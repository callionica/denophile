import { MediaGroup, MediaPrimary } from "../../media.ts";

export function pageVideo(mediaGroup: MediaGroup, file: MediaPrimary) {
    return file.urlName;
}