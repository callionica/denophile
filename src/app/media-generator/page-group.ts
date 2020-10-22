import { MediaGroup, MediaPrimary } from "../../media.ts";

// The subgroup number or the year
export function fileDisplaySubgroupNumber(file: MediaPrimary) {
	return file.info.subgroupNumber || file.info.year || "";
}

// The number or a number based on month and day
export function fileDisplayNumber(file: MediaPrimary) {
	function numberFromDate(file: MediaPrimary) {
		if ((file.info.month !== undefined) && (file.info.day !== undefined)) {
			return `${file.info.month.padStart(2, "0")}${file.info.day.padStart(2, "0")}`;
		}
	}

	return file.info.number || numberFromDate(file) || ""
}

// The name including the group if it differs from the media group
function fileDisplayName(mediaGroup: MediaGroup, file: MediaPrimary) {
	const group = (file.info.group === mediaGroup.group) ? "" : file.info.group;
	const name = file.info.datelessName || file.name;
	return `${group ? group + " - " : ""}${name}`.replace("--", "-");
}

export function divideTitle(title: string): { title: string, subtitle?: string } {
	const divider = " - ";
	const index = title.indexOf(divider);
	if (index < 0) {
		return { title };
	}
	return { title: title.substring(0, index), subtitle: title.substring(index + divider.length)}
}

export function pageGroup(mediaGroup: MediaGroup) {
	const title = mediaGroup.name.replace("--", "-");
	const splitTitle = divideTitle(title);
	const h2 = (splitTitle.subtitle !== undefined) ? `<h2>${splitTitle.subtitle}</h2>` : "";

	const displaySubgroup = (mediaGroup.subgroups.length > 1) || (!["1", ""].includes(fileDisplaySubgroupNumber(mediaGroup.files[0])));

	const hideSeason = displaySubgroup ? "" : "data-hide-season";

	const poster = (mediaGroup.images[0] || mediaGroup.imagesFromFirstFile[0])?.target.toString() || "folder.jpg"; // TODO


	const media = mediaGroup.files.map(file => {
		return `<a href="${file.urlName}/index.html"><span class="season">${fileDisplaySubgroupNumber(file)}</span><span class="episode">${fileDisplayNumber(file)}</span><span class="name">${fileDisplayName(mediaGroup, file)}</span></a>`;

	}).join("\n");

	const html =
		`<html>
	<head>
	<title>${title}</title>
	<link rel="stylesheet" type="text/css" href="../styles.css">
	<script src="../container-script.js"></script>
	</head>
	<body data-page="group" ${hideSeason}>
	<h1>${splitTitle.title}</h1>
	${h2}
	<div id="sidebar"><img src="${poster}"></div>
	<div id="content">
	${media}
	</div>
	</body>
    </html>`;

	return html;
}