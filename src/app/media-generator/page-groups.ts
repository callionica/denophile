import { MediaGroup } from "../../media.ts";

export function pageGroups(mediaGroups: MediaGroup[]) {
    const title = "Media";

    type FancyName = { article: string | undefined, body: string };
    function name(mediaGroup: MediaGroup): FancyName {
        const name = mediaGroup.name.replace("--", "-");
        const result: FancyName = { article: undefined, body: name };

        const articleRE = /^(?<article>(the)|(an?)|(l[aeo]s?)|(un[ae]?)|(un[ao]s)|(des))\s(?<body>.*)$/i;
        const match = articleRE.exec(name);
        if (match && match.groups) {
            const article = match.groups["article"];
            const body = match.groups["body"];
            result.article = article;
            result.body = body;
        }
        return result;
    }

    const groups = mediaGroups.map(mediaGroup => {
        const fancyName = name(mediaGroup);
        const article = (fancyName.article !== undefined) ? `<span class="article">${fancyName.article} </span>` : "";
        return `<div><a href="${mediaGroup.urlName + "/index.html"}">${article}${fancyName.body}</a></div>`;
    }).join("\n");

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