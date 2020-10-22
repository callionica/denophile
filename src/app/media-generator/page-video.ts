import { MediaGroup, MediaPrimary } from "../../media.ts";
import { divideTitle, fileDisplayNumber, fileDisplaySubgroupNumber } from "./page-group.ts";

type F = { url: URL, mimetype: string | undefined };

// Also handles audio
export async function pageVideo(mediaGroup: MediaGroup, file: MediaPrimary, subtitles: (F & { language: string })[]) {

    const description = await file.description();

    const images = await file.images();
    const image = { url: images[0]?.target, mimetype: images[0]?.mimetype }; // TODO

    const media = { url: file.target, mimetype: file.mimetype };

    const title = fileTitle(mediaGroup, file);

    return htmlPage(mediaGroup, file, title, description, image, media, subtitles);
    // return "<pre>" + file.urlName + "\n" + title + "\n" + description + "</pre>";
}

function fileSE(file: MediaPrimary): string {
    const s = fileDisplaySubgroupNumber(file);
    const e = fileDisplayNumber(file);
    return `${s.length ? "S" + s + " " : ""}${e.length ? "E" + e : ""}`;
}

// The name followed by the group SN EN
function fileTitle(mediaGroup: MediaGroup, file: MediaPrimary): string {
    const name = file.info.datelessName || file.name;
    const group = file.info.group || mediaGroup.group;
    const se = fileSE(file);
    return `${name}${group ? " - " + group : ""}${se ? " " + se : ""}`.replace("--", "-");
}

function htmlSynopsis(description: string): string {
    if (description.length === 0) {
        return "";
    }

    return `<p class="synopsis">${description}</p>`;
}

function htmlSource(media: F): string {
    return `<source src="${media.url}" type="${media.mimetype}">`;
}

function htmlSubtitleTrack(subtitle: F & { language: string }, index: number): string {
    var default_ = (index == 0) ? "default " : "";
    return `<track kind="subtitles" ${default_}label="${subtitle.language}" srclang="${subtitle.language}" src="${subtitle.url}">`;
}

function htmlVideo(media: F, image: F, subtitles: (F & { language: string })[]): string {
    return "" +
        `<video class="backdrop-video" controls poster="${image.url}">
	${htmlSource(media)}
	${subtitles.map((subtitle, index) => htmlSubtitleTrack(subtitle, index)).join("\n\t")}
</video>
`;
}

function htmlPage(mediaGroup: MediaGroup, file: MediaPrimary, title: string, description: string, image: F, media: F, subtitles: (F & { language: string })[]): string {
    const name = (file.info.datelessName || file.name).replace("--", "-");
    const splitName = divideTitle(name);
    const h2 = (splitName.subtitle !== undefined) ? `<h2 class="episode_name">${splitName.subtitle}</h2>` : "";

    let group = (file.info.group || mediaGroup.group).replace("--", "-");
    if (group === name) {
        group = "";
    }

    var dots = "../..";

    const html =
        `
<!DOCTYPE html>
<html>
<head>
<title>${title}</title>
<link rel="stylesheet" type="text/css" href="${dots}/styles.css">
<script src="${dots}/script.js"></script>
</head>

<body data-page="item" data-playing="false">

	<div class="backdrop">
		<img class="backdrop-image" src="${image.url}">
		<div class="backdrop-gradient"></div>
${htmlVideo(media, image, subtitles)}
	</div>

	<div class="overlay">
		<div class="sized-content">
			<div id="play" class="play" onclick="togglePlay()">▶</div>	
<h1 class="episode_name">${splitName.title}</h1>
${h2}
<h2><span class="show">${group}</span> <span class="locator">${fileSE(file)}</span></h2>
			<p class="elapsed"><span class="currentTime"></span><span class="duration">--:--</span></p>
		</div>
		<div class="unsized-content">
${htmlSynopsis(description)}
		</div>
	</div>

	<body>
</html>
`;
    return html;
}
