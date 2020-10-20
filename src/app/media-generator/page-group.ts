import { IMAGE_EXTENSIONS, AUDIO_EXTENSIONS, MediaGroup, MediaPrimary } from "../../media.ts";

export async function pageGroup(mediaGroup: MediaGroup) {
    const title = mediaGroup.name.replace("--", "-");
    const displaySubgroup = mediaGroup.subgroups.length > 1;

    const hideSeason = displaySubgroup ? "" : "data-hide-season";

    const poster = mediaGroup.images[0] || mediaGroup.imagesFromFirstFile[0] || "folder.jpg"; // TODO

	function fileDisplayName(file: MediaPrimary) {
		console.log(file.info);
		const group = (file.info.group === mediaGroup.group) ? "" : file.info.group;
		const name = file.info.datelessName || file.name;
		return `${group ? group + " - " : ""}${name}`.replace("--", "-");
	}

    const media = mediaGroup.files.map(file => {
		return `<a href="${file.urlName}/index.html"><span class="season">${file.info.subgroupNumber || ""}</span><span class="episode">${file.info.number || ""}</span><span class="name">${fileDisplayName(file)}</span></a>`;
		
	}).join("\n");

    const html = 
	`<html>
	<head>
	<title>${title}</title>
	<link rel="stylesheet" type="text/css" href="../styles.css">
	<script src="../container-script.js"></script>
	</head>
	<body data-page="group" ${hideSeason}>
	<h1>${title}</h1>
	<div id="sidebar"><img src="${poster.entry.targets[0]}"></div>
	<div id="content">
	${media}
	</div>
	</body>
    </html>`;
    
    return html;
}