// Building on top of the satellite file system
// with some media-specific features

// The layers are:
// media.ts -> satellite.ts -> junction.ts -> file.ts

import { readTextFile } from "./file.ts";
import type { Entry } from "./junction.ts";
import { Primary, Satellite } from "./satellite.ts";
import { toSortableName, toURLName, first, generable } from "./utility.ts";

type IMAGE_USE = "backdrop" | "poster";

export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png"];
export const SUBTITLE_EXTENSIONS = ["vtt", "webvtt", "ttml", "srt"];
export const DESCRIPTION_EXTENSIONS = ["txt"];
export const AUDIO_EXTENSIONS = ["m4a", "mp3"];
export const VIDEO_EXTENSIONS = ["m4v", "mp4", "ts"];
export const MEDIA_EXTENSIONS = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS];

export interface Data {
    name?: string; // Track name, Episode name
    numberFromName?: string; // Track number, episode number if it came from the name
    datelessName?: string; // Name with date parenthetical removed

    group?: string; // Artist, Show

    subgroup?: string; // Album, Season
    subgroupNumber?: string; // Season number
    numberFromSubgroupName?: string;

    number?: string;  // Track number, episode number
    endNumber?: string;  // Last track number, episode number in a range

    year?: string;
    month?: string;
    day?: string;
}

/**
 * Creates a standard filename from group, subgroup, date, name, etc.
 * 
 * Apart from ignoring the difference between 'Season' and 'Series',
 * it should be possible to recover the same data from the standard filename
 * as was contained in the original data.
 * 
 * @param data The data from which to create the filename.
 */
export function standardFilename(data: Data) {

    let group = "";
    if (data.group !== undefined) {
        group = data.group;
    }

    if (group.length > 0) {
        group += " - ";
    }

    const subgroupNumber = data.subgroupNumber || data.numberFromSubgroupName;

    let subgroup = "";
    if (data.subgroup !== undefined) {
        if ((data.number !== undefined) &&
            ((data.subgroup === `Season ${subgroupNumber}`)
                || (data.subgroup === `Series ${subgroupNumber}`))
        ) {
            // nothing
        } else {
            subgroup = `${data.subgroup} - `;
        }
    }

    let date = "";
    if ((data.year !== undefined)) {
        if ((data.month !== undefined) && (data.day !== undefined)) {
            date = `${data.year}-${data.month}-${data.day}`;
        } else {
            date = `${data.year}`;
        }
    }

    let parenthetical = "";
    if (date.length > 0) {
        if (data.group === undefined) {
            parenthetical = ` (${date})`;
            date = "";
        } else {
            date += " - ";
        }
    }

    let numbers = "";
    if (subgroupNumber && data.number) {
        numbers = `${subgroupNumber?.padStart(2, "0")}-${data.number?.padStart(2, "0")}`;
    } else if (data.number) {
        numbers = `${data.number?.padStart(2, "0")}`;
    }

    if (data.endNumber) {
        numbers += `-to-${data.endNumber?.padStart(2, "0")}`;
    }

    if (numbers.length > 0) {
        numbers += " ";
    }

    const name = data.datelessName || data.name || "";

    return `${group}${subgroup}${date}${numbers}${name}${parenthetical}`;
}

export function parseData(text: string, possibles: RegExp[] = standardDataExtractors): Data {
    let match;
    for (const possible of possibles) {
        match = possible.exec(text);
        if (match) {
            break;
        }
    }

    const result = match ? { ...match.groups } : {};
    Object.keys(result).forEach(key => (result[key] === undefined) && delete result[key])
    return result;
}

const standardDataExtractors = (function () {

    // Because of greedy matching \s*(?<x>.*\S)\s* means that x starts and ends with non-whitespace

    // Whitespace
    //const ws = `(?:\\s{1,4})`;
    const ws = `(?:[^\\S\u00A0]{1,4})`; // whitespace except non-breaking space

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

    const period = `[.]`;
    const leftParen = `[(]`;
    const rightParen = `[)]`;
    const dash = `-`;
    const colon = `:`;

    const separator = grp(ws, dash, ws);

    const chapter = alt(`Chapter`, `Ch[.]?`, `C`);
    const season = alt(`Series`, `Season`, `S`);
    const episode = alt(`Episode`, `Ep[.]?`, `E`);
    const track = alt(`Track`);

    const digits = (count: number) => `(?:\\d{${count}})`;
    const phrase = `(?:.{0,128}\\S)`;
    const number = (capture: keyof Data) => grp(`0{0,4}`, cap(capture)(`\\d{1,4}(?=\\D|$)`));

    const numberSeparator = alt(separator, grp(period, ws), ws);
    const number_prefix = (capture: keyof Data) => grp(number(capture), numberSeparator);

    const dd = alt(`[0][123456789]`, `[1][0123456789]`, `[2][0123456789]`, `[3][01]`);
    const mm = alt(`[0][123456789]`, `[1][012]`);
    const yyyy = digits(4);

    const dateSeparator = alt(dash, period);

    // A 4 digit year or a full YYYY-MM-DD date
    const yearOrDate = grp(cap("year")(yyyy), opt(dateSeparator, cap("month")(mm), dateSeparator, cap("day")(dd)));

    const group = phrase;

    const subgroupNumber = number("subgroupNumber");

    const plexNumber = grp(
        season, subgroupNumber, episode, number("number"),
        opt(opt(dash), episode, number("endNumber"))
    );

    const twoPartNumber = grp(
        subgroupNumber, alt(dash, "x"),
        number("number"),
        opt(opt(alt('to', '-to-')), number("endNumber")),
    );

    const itemNumber = grp(
        opt(subgroupNumber, alt(dash, "x")),
        number("number"),
        opt(opt(alt('to', '-to-')), number("endNumber")),
    );

    const subgroup = alt(grp(alt(season, chapter), ws, number("numberFromSubgroupName")), phrase);
    const name = alt(
        grp(
            alt(episode, track, chapter), ws, number("numberFromName"),
            opt(period, ws, phrase)
        ),
        grp(cap("datelessName")(phrase), ws, leftParen, yearOrDate, rightParen),
        phrase
    );
    const datelessName = alt(
        grp(alt(episode, track, chapter), ws, number("numberFromName")),
        phrase
    );

    // Basics:
    // When there are three sections, it's `group - subgroup - name`
    // When there are two sections, it's `group - name`
    // When there is one section, it's `name`
    // `name` can be prefixed with a number in most formats
    // The text 'Chapter' and 'Season' (and variations like 'Ch' and 'S') indicate a subgroup
    // A date may appear in subgroup or item number position. The date is assumed to
    // apply to the item, and the subgroup and ordering is assumed to be generated from the date.
    // A date may also appear in parentheses as part of the name. In this case, `name` contains the name and parenthetical, and `datelessName` leaves out the parenthetical.
    return [
        re( // Date TV format: "Doctor Who - 2005-03-26 - Rose"
            cap("group")(group), separator,
            yearOrDate, alt(separator, ws),
            opt(itemNumber, numberSeparator),
            cap("name")(datelessName)
        ),
        re(
            cap("group")(group), separator,
            cap("subgroup")(subgroup), separator,
            itemNumber, numberSeparator,
            cap("name")(name)
        ),
        re( // Plex TV format: "Doctor Who - s1e1 - Rose"
            opt(cap("group")(group), separator),
            plexNumber,
            opt(separator, cap("name")(name))
        ),
        re( // Preferred TV format: "Doctor Who - 01-01 Rose"
            opt(cap("group")(group), separator),
            twoPartNumber,
            opt(numberSeparator, cap("name")(name))
        ),
        re(
            cap("group")(group), separator,
            cap("subgroup")(subgroup), separator,
            cap("name")(name)
        ),
        re(
            cap("group")(group), separator,
            itemNumber, numberSeparator,
            cap("name")(name)
        ),
        re(
            cap("group")(group), separator,
            cap("name")(name)
        ),
        re( // Audio format (artist & album come from folders): "01 Rose"
            itemNumber, numberSeparator,
            cap("name")(name)
        ),
        re(
            cap("name")(name)
        ),
    ];
})();

export class MediaPrimary extends Primary {
    info_?: Data;
    standardName_?: string;
    sortableName_?: string;
    urlName_?: string;

    refresh() {
        super.refresh();
        this.info_ = undefined;
        this.standardName_ = undefined;
        this.sortableName_ = undefined;
        this.urlName_ = undefined;
    }

    isPrimary(entry: Entry): boolean {
        if (!entry.extension) {
            return false;
        }

        return MEDIA_EXTENSIONS.includes(entry.extension.toLowerCase());
    }

    get info(): Data {
        // We don't parse folder names
        if (this.isFolder) {
            return {};
        }

        if (this.info_ !== undefined) {
            return this.info_;
        }

        const result = parseData(this.name, standardDataExtractors);

        function cleanup(text: string) {
            text = text.replace(/[_\s]+/g, " ");
            return text;
        }

        if (result.group === undefined) {
            if (this.parent !== undefined) {
                const grandParent = this.parent.parent;
                if ((grandParent !== undefined) && (grandParent !== this.root)) {
                    result.group = grandParent.name;
                    if (result.subgroup === undefined) {
                        result.subgroup = this.parent.name;
                    }
                } else {
                    result.group = this.parent.name;
                }
            }
        }

        if (result.group !== undefined) {
            result.group = cleanup(result.group);
        }

        if (result.subgroupNumber === undefined) {
            if (result.numberFromSubgroupName !== undefined) {
                result.subgroupNumber = result.numberFromSubgroupName;
            }
        }

        if (result.subgroup === undefined) {
            if (result.subgroupNumber !== undefined) {
                result.subgroup = `Season ${result.subgroupNumber}`;
            } else if (result.year !== undefined) {
                result.subgroup = result.year;
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

        function generatedName(file: MediaPrimary) {
            const number = result.number;
            if (number) {
                const thing = ((file.extension !== undefined) && AUDIO_EXTENSIONS.includes(file.extension)) ? "Track" : "Episode";
                return `${thing} ${number}`;
            }
        }

        if (result.name === undefined) {
            result.name = generatedName(this) || this.name;
        }

        if (result.name !== undefined) {
            result.name = cleanup(result.name);
        }

        if (result.datelessName === undefined) {
            result.datelessName = result.name;
        } else {
            result.datelessName = cleanup(result.datelessName);
        }

        this.info_ = result;
        return result;
    }

    /**
     * The group folder is the grandparent if it matches the name of the group,
     * or it is the parent if it matches the name of the group. Otherwise there
     * is no group folder.
     */
    get groupFolder(): this | undefined {
        const group = this.info.group;
        const parent = this.parent;

        if ((group !== undefined) && (parent !== undefined)) {

            const grandParent = parent.parent;
            if (grandParent !== undefined) {
                if (grandParent.name === group) {
                    return grandParent;
                }
            }

            if (parent.name === group) {
                return parent;
            }
        }

        return undefined;
    }

    /**
     * The subgroup folder is the parent if it matches the name of the subgroup
     * and the grandparent folder has been identified as the group folder. Otherwise there
     * is no subgroup folder.
     */
    get subgroupFolder(): this | undefined {
        const subgroup = this.info.subgroup;
        const parent = this.parent;
        const grandParent = parent?.parent;

        if ((subgroup !== undefined) && (parent !== undefined) && (grandParent !== undefined)) {
            if ((parent.name === subgroup) && (grandParent === this.groupFolder)) {
                return parent;
            }
        }

        return undefined;
    }

    /**
     * The container folder is the parent folder if that folder hasn't been identified as
     * the group or subgroup folder. Otherwise there is no container folder.
     * 
     * You'll only get a container folder if the filename contains a group and it's different
     * from the name of the grandparent & parent folders. If the filename doesn't contain a group,
     * the parent folder defines a group or subgroup instead of a container.
     */
    get containerFolder(): this | undefined {
        const parent = this.parent;

        if ((parent !== this.groupFolder) && (parent !== this.subgroupFolder)) {
            return parent;
        }

        return undefined;
    }

    /**
     * The context folder is the container folder, the subgroup folder, or the group folder.
     * 
     * This is a good candidate for grouping related media together in the UI.
     */
    get contextFolder(): this | undefined {
        return this.containerFolder || this.subgroupFolder || this.groupFolder;
    }

    /** The standard name */
    get standardName(): string {
        if (this.standardName_ === undefined) {
            this.standardName_ = standardFilename(this.info);
        }

        return this.standardName_;
    }

    /** The sortable name */
    get sortableName(): string {
        if (this.sortableName_ === undefined) {
            this.sortableName_ = toSortableName(this.standardName);
        }

        return this.sortableName_;
    }

    /** The URL name */
    get urlName(): string {
        if (this.urlName_ === undefined) {
            this.urlName_ = toURLName(this.standardName);
        }

        return this.urlName_;
    }

    /**
     * Returns the satellites that match the provided extensions
     * 
     * @param extensions Array of extensions to match
     */
    async getSatellites(extensions: string[]): Promise<Satellite<this>[]> {
        const match = (s: Satellite<this>) => {
            return s.extension && extensions.includes(s.extension.toLowerCase());
        };
        return (await this.satellites()).filter(match);
    }

    /**
     * Searches for matching satellites starting at the current item and then
     * through subgroup, subgroup-tagged group, group, and container primaries
     * if no match is found at a lower level.
     * 
     * NOTE: RETURNS ONLY THE FIRST LEVEL OF SATELLITES
     * 
     * This is useful for images or text descriptions, where you'd like 
     * the specific result for the episode of a TV show, but if none is found, you'd accept
     * a match for the season or the show or the container.
     * 
     * Note that subgroup-related satellites can be found in two ways:
     * 1. As a satellite of the subgroup folder
     * 2. As a satellite of the group folder tagged with the subgroup name
     * 
     * @param extensions Array of extensions to match
     */
    async findSatellitesLikeFile(extensions: string[]): Promise<Satellite<this>[]> {

        // Look for matching satellites on this object.
        if (this !== undefined) {
            const satellites = await this.getSatellites(extensions);

            if (satellites.length > 0) {
                return satellites;
            }
        }

        // If no satellites, look on the subgroup folder.
        if (this.subgroupFolder !== undefined) {
            const satellites = await this.subgroupFolder.findSatellites(extensions);

            if (satellites.length > 0) {
                return satellites;
            }
        }

        // If no satellites, look on the group folder.
        if (this.groupFolder !== undefined) {
            const satellites = await this.groupFolder.findSatellites(extensions);
            if (satellites.length > 0) {
                return satellites;
            }
        }

        // No satellites on the item, the subgroup, or the group so
        // time to check the container folder for satellites.
        if (this.containerFolder !== undefined) {
            const satellites = await this.containerFolder.findSatellites(extensions);

            if (satellites.length > 0) {
                return satellites;
            }
        }

        // Otherwise, return an empty array
        return [];
    }

    /**
     * Searches for matching satellites starting at the current item and then
     * through satellites of the parent that have a tag that matches the name of
     * this item, if no match is found at a lower level.
     * 
     * @param extensions Array of extensions to match
     */
    async findSatellitesLikeFolder(extensions: string[]): Promise<Satellite<this>[]> {

        const name = this.name;
        const parent = this.parent!;

        // Look for satellites on this folder.
        for (const primary of [this]) {
            if (primary !== undefined) {
                const satellites = await primary.getSatellites(extensions);

                if (satellites.length > 0) {
                    return satellites;
                }
            }
        }

        // If no satellites, look for tagged satellites on the parent folder.
        for (const primary of [parent]) {
            if (primary !== undefined) {
                const satellites = await primary.getSatellites(extensions);

                if (name !== undefined) {
                    const subgroupSatellites = satellites.filter(s => s.tags.includes(name));
                    if (subgroupSatellites.length > 0) {
                        return subgroupSatellites;
                    }
                }
            }
        }

        // Otherwise, return an empty array
        return [];
    }

    async findSatellites(extensions: string[]): Promise<Satellite<this>[]> {
        if (this.isFolder) {
            return this.findSatellitesLikeFolder(extensions);
        }
        return this.findSatellitesLikeFile(extensions);
    }

    /** Images use the fallback algorithm */
    async images(): Promise<Satellite<this>[]> {
        return this.findSatellites(IMAGE_EXTENSIONS);
    }

    /** Descriptions use the fallback algorithm */
    async descriptions(): Promise<Satellite<this>[]> {
        return this.findSatellites(DESCRIPTION_EXTENSIONS);
    }

    /**
     * Returns the description for the provided language
     * or the English description if the provided language is not available
     * or an empty string if no description is found.
     * */
    async description(language = "en"): Promise<string> {
        const descriptions = await this.descriptions();
        
        let description = descriptions.find(s => s.language === language);
        if (description === undefined) {
            description = descriptions.find(s => s.language === "en");
        }

        const result = (description !== undefined) ? await readTextFile(description.target) : "";
        return result;
    }

    /** Subtitles use the direct algorithm */
    async subtitles(): Promise<Satellite<this>[]> {
        return this.getSatellites(SUBTITLE_EXTENSIONS);
    }
}

export type MediaGroup = {
    name: string,
    sortableName: string,
    urlName: string,

    group: string,

    images: Satellite<MediaPrimary>[],
    imagesFromFirstFile: Satellite<MediaPrimary>[],

    files: MediaPrimary[],

    folder: MediaPrimary,
    isSubgroup: boolean,

    subgroups: string[],
};

/**
 * Groups together media files based on their contextFolder
 * and sorts the files within each group based on their sortableName.
 * 
 * @param primaries The files to group
 */
export async function getMediaGroups(primaries: Iterable<MediaPrimary>): Promise<MediaGroup[]> {
    const groups: MediaGroup[] = [];

    for (const primary of primaries) {
        if (primary.isFolder) {
            continue;
        }

        const found = groups.find(group => group.folder === primary.contextFolder);
        if (found) {
            found.files.push(primary);
            if (primary.contextFolder === primary.subgroupFolder) {
                found.isSubgroup = true;
            }
        } else {
            const group = {
                name: "",
                sortableName: "",
                urlName: "",
                group: "",
                images: [],
                imagesFromFirstFile: [],
                folder: primary.contextFolder!,
                isSubgroup: (primary.contextFolder === primary.subgroupFolder),
                files: [primary],
                subgroups: [],
            };
            groups.push(group);
        }
    }

    for (const group of groups) {
        if (group.isSubgroup) {
            group.group = group.folder.parent!.name;
            group.name = group.group + " - " + group.folder.name;
        } else {
            group.group = group.folder.name;
            group.name = group.group;
        }

        group.sortableName = toSortableName(group.name);
        group.urlName = toURLName(group.name);

        group.files.sort((a, b) => {

            // A 'grouped' item goes before a 'contained' item
            if ((a.containerFolder === undefined) && (b.containerFolder !== undefined)) {
                return -1;
            }

            if ((a.containerFolder !== undefined) && (b.containerFolder === undefined)) {
                return 1;
            }

            // PERF: Could do property-level sorting, but this is probably OK

            // Otherwise compare the standard name (in its sortable form)
            return a.sortableName.localeCompare(b.sortableName, "en", { numeric: true });
        });

        // We will use the list of subgroups to determine whether to display the subgroup
        // when we display the list of files, so it's important to preserve 'no subgroup'
        // in the output. Here, we represent no subgroup as an empty string.
        group.subgroups = [...new Set(group.files.map(file => file.info.subgroup || ""))] as string[];

        // Get the images associated with this folder 
        group.images = await group.folder.images();

        // Get the first set of images from a file
        const fileImages = await first(group.files, async (file) => {
            const images = await file.images();
            if (images.length > 0) {
                return images;
            }
        });

        group.imagesFromFirstFile = fileImages || [];
    }

    groups.sort((a, b) => {
        return a.sortableName.localeCompare(b.sortableName, "en", { numeric: true });
    });

    return groups;
}
