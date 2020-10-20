import { IMAGE_EXTENSIONS, AUDIO_EXTENSIONS, MediaGroup, MediaPrimary } from "../../media.ts";

export function pageGroup(mediaGroup: MediaGroup) {

	function fileDisplaySubgroup(file: MediaPrimary) {
		return file.info.subgroupNumber || file.info.year || "";
	}

	function fileDisplayName(file: MediaPrimary) {
		console.log(file.info);
		const group = (file.info.group === mediaGroup.group) ? "" : file.info.group;
		const name = file.info.datelessName || file.name;
		return `${group ? group + " - " : ""}${name}`.replace("--", "-");
	}

	const title = mediaGroup.name.replace("--", "-");
	const displaySubgroup = (mediaGroup.subgroups.length > 1) || (!["1", ""].includes(fileDisplaySubgroup(mediaGroup.files[0])));

	const hideSeason = displaySubgroup ? "" : "data-hide-season";

	const poster = mediaGroup.images[0] || mediaGroup.imagesFromFirstFile[0] || "folder.jpg"; // TODO


	const media = mediaGroup.files.map(file => {

		function numberFromDate(file: MediaPrimary) {
			if ((file.info.month !== undefined) && (file.info.day !== undefined)) {
				return `${file.info.month.padStart(2, "0")}${file.info.day.padStart(2, "0")}`;
			}
		}

		return `<a href="${file.urlName}/index.html"><span class="season">${fileDisplaySubgroup(file)}</span><span class="episode">${file.info.number || numberFromDate(file) || ""}</span><span class="name">${fileDisplayName(file)}</span></a>`;

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