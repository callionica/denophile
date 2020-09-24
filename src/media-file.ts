// media-file.ts provides a view over a file system that reveals associations between AV files
// and other files like subtitles, images, text files, and JSON metadata.

// MediaEntry is a tree of folders or audio/video files

import type { Entry } from "./junction.ts";

const MEDIA_EXTENSIONS = ["m4a", "m4v", "mp4", "ts"];

function isMedia(entry: Entry) {
    if (!entry.extension) {
        return false;
    }

    return MEDIA_EXTENSIONS.includes(entry.extension.toLowerCase());
}

interface Data {
    name?: string; // Track name, Episode name
    numberFromName?: string; // Track number, episode number if it came from the name

    group?: string; // Artist, Show
    subgroup?: string; // Album, Season
    subgroupNumber?: string; // Season number

    number?: string;  // Track number, episode number
    endNumber?: string;  // Last track number, episode number in a range

    year?: string;
    month?: string;
    day?: string;
}

function parseData(text: string, possibles: RegExp[]): Data {
    let match;
    for (const possible of possibles) {
        match = possible.exec(text);
        if (match) {
            break;
        }
    }

    return match ? { ...match.groups } : {};
}

const standardDataExtractors = (function () {

    // Because of greedy matching \s*(?<x>.*\S)\s* means that x starts and ends with non-whitespace

    // Whitespace
    let ws = `(?:\\s{1,4})`;

    // Create a regular expression
    function re(...patterns: string[]) {
        // Anchor to start/end and allow (ignore) leading/trailing whitespace
        return new RegExp(`^${ws}?` + patterns.join("") + `${ws}?$`, "i");
    }

    // Make some pieces of a regular expression optional
    function opt(...patterns: string[]) {
        if (patterns.length == 1) {
            return patterns[0] + "?";
        }
        return `(?:${patterns.join("")})?`;
    }

    // Group multiple items
    function grp(...patterns: string[]) {
        return `(?:${patterns.join("")})`;
    }

    // Group alternatives
    function alt(...patterns: string[]) {
        if (patterns.length == 1) {
            return patterns[0];
        }
        return `(?:${patterns.join("|")})`;
    }

    // Named capture group
    function cap(name: keyof Data) {
        return function (...patterns: string[]) {
            return `(?<${name}>${patterns.join("")})`;
        }
    }

    let period = `[.]`;
    let dash = `-`;
    let colon = `:`;

    let separator = grp(ws, dash, ws);

    let season = alt(`Series`, `Season`, `S`);
    let episode = alt(`Episode`, `Ep[.]?`, `E`);
    let track = alt(`Track`);

    let digits = (count: number) => `(?:\\d{${count}})`;
    let phrase = `(?:.{0,64}\\S)`;
    let number = (capture: keyof Data) => grp(`0{0,4}`, cap(capture)(`\\d{1,4}(?=\\D|$)`));

    let number_prefix = (capture: keyof Data) => grp(number(capture), alt(separator, grp(period, ws), ws));

    let year = cap("year")(digits(4));
    let month = cap("month")(digits(2));
    let day = cap("day")(digits(2));

    let dateSeparator = alt(dash, period, ws);

    let group = phrase;
    let subgroupNumber = number("subgroupNumber");
    let subgroup = alt(grp(season, ws, subgroupNumber), phrase);
    let name = alt(grp(alt(episode, track), ws, number("numberFromName")), phrase);

    return [
        re(
            cap("group")(group), separator,
            cap("subgroup")(subgroup), separator,
            number_prefix("number"),
            cap("name")(name)
        ),
        re( // Date TV format: "Doctor Who - 2005-03-26 - Rose"
            cap("group")(group), separator,
            year, dateSeparator, month, dateSeparator, day, alt(separator, ws),
            cap("name")(name)
        ),
        re( // Plex TV format: "Doctor Who - s1e1 - Rose"
            opt(cap("group")(group), separator),
            season, subgroupNumber, episode, number("number"),
                opt(opt(dash), episode, number("endNumber")), separator,
            cap("name")(name)
        ),
        re( // Preferred TV format: "Doctor Who - 01-01 Rose"
            opt(cap("group")(group), separator),
            subgroupNumber, dash, number("number"), opt(alt(separator, ws),
            cap("name")(name))
        ),
        re(
            cap("group")(group), separator,
            cap("subgroup")(subgroup), separator,
            cap("name")(name)
        ),
        re( // Audio format (artist & album come from folders): "01 Rose"
            number_prefix("number"),
            cap("name")(name)
        ),
        re(
            cap("group")(group), separator,
            number_prefix("number"),
            cap("name")(name)
        ),
        re(
            cap("group")(group), separator,
            cap("name")(name)
        ),
    ];
})();

class MediaEntry {
    entry: Entry;
    parent?: MediaEntry;

    data_?: Data;

    entryChildren_?: Entry[];
    children_?: MediaEntry[];

    get name(): string {
        return this.entry.name;
    }

    refresh() {
        this.data_ = undefined;
        this.entryChildren_ = undefined;
        this.children_ = undefined;
    }

    constructor(entry: Entry, parent?: MediaEntry) {
        this.entry = entry;
        this.parent = parent;
    }

    async entryChildren(): Promise<Entry[]> {
        if (this.entryChildren_ === undefined) {
            this.entryChildren_ = await this.entry.children();    
        }
        
        return this.entryChildren_;
    }

    async children(): Promise<MediaEntry[]> {
        if (this.children_ === undefined) {
            const c = await this.entryChildren();
            this.children_ = c.filter(c => c.isFolder || isMedia(c)).map(c => new MediaEntry(c, this));
        }
        
        return this.children_;
    }

    isSatellite(entry: Entry): boolean {
        const thisName = this.name;
        const length = thisName.length;
        const name = entry.name;
        return name.startsWith(thisName) && ((name.length === length) || (name[length] === "."));
    }

    async satellites(): Promise<Entry[]> {
        let result: Entry[] = [];

        if (this.parent != undefined) {
            const parentChildren = await this.parent.entryChildren();
            const siblingSatellites = parentChildren.filter(e => (!e.isFolder) && (e !== this.entry) && this.isSatellite(e));
            result = siblingSatellites;
        }

        return result;
    }

    get data(): Data {
        if (this.data_ === undefined) {
            this.data_ = parseData(this.name, standardDataExtractors);
        }
        return this.data_;
    }

    get info(): Data {
        let result = { ...this.data };

        function cleanup(text: string) {
            text = text.replace(/[_\s]+/g, " ");
            return text;
        }

        if (result.group === undefined) {
            if (this.parent) {
                if (this.parent.parent) {
                    result.group = this.parent.parent.name;
                } else {
                    result.group = this.parent.name;
                }
            }
        }

        if (result.group !== undefined) {
            result.group = cleanup(result.group);
        }

        if (result.subgroup === undefined) {
            if (result.subgroupNumber !== undefined) {
                result.subgroup = `Season ${result.subgroupNumber}`;
            } else if (result.year !== undefined) {
                result.subgroup = result.year;
            } else if (this.parent && this.parent.parent) {
                result.subgroup = this.parent.name;
            }
        }

        if (result.subgroup !== undefined) {
            result.subgroup = cleanup(result.subgroup);
        }

        if (result.number === undefined) {
            if (result.numberFromName !== undefined) {
                result.number = result.numberFromName;
            }
        }

        if (result.name === undefined) {
            result.name = this.name;
        }

        if (result.name !== undefined) {
            result.name = cleanup(result.name);
        }

        return result;
    }
}