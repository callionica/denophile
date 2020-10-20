import { MediaGroup } from "../../media.ts";

export function pageGroups(mediaGroups: MediaGroup[]) {
    const title = "Media";
    
    const groups = mediaGroups.map(mediaGroup => `<div><a href="${mediaGroup.urlName + "/index.html"}">${mediaGroup.name.replace("--", "-")}</a></div>`).join("\n");

	const html = 
	`<html>
	<head>
	<title>${title}</title>
	<link rel="stylesheet" type="text/css" href="styles.css">
	<script src="container-script.js"></script>
	</head>
	<body data-page="groups">
	<h1>${title}</h1>
	${groups}
	</body>
	</html>`;
	
	return html;
}