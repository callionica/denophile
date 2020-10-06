// Building on top of the satellite file system
// with some media-specific features

// The layers are:
// media.ts -> satellite.ts -> junction.ts -> file.ts

// TODO - satellites in containers that aren't group/subgroup
// TODO - 

import type { Entry } from "./junction.ts";
import { Primary, Satellite } from "./satellite.ts";

type IMAGE_USE = "backdrop" | "poster";

export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png"];
export const SUBTITLE_EXTENSIONS = ["vtt", "webvtt", "ttml", "srt"];
export const TEXT_EXTENSIONS = ["txt"];
export const MEDIA_EXTENSIONS = ["m4a", "m4v", "mp4", "ts"];

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

export function parseData(text: string, possibles: RegExp[] = standardDataExtractors): Data {
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
    const ws = `(?:\\s{1,4})`;

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
    const phrase = `(?:.{0,64}\\S)`;
    const number = (capture: keyof Data) => grp(`0{0,4}`, cap(capture)(`\\d{1,4}(?=\\D|$)`));

    const numberSeparator = alt(separator, grp(period, ws), ws);
    const number_prefix = (capture: keyof Data) => grp(number(capture), numberSeparator);


    const dd = alt(`[0][123456789]`, `[1][0123456789]`, `[2][0123456789]`, `[3][01]`);
    const mm = alt(`[0][123456789]`, `[1][012]`);
    const yyyy = digits(4);

    const dateSeparator = alt(dash, period, ws);

    // A 4 digit year or a full YYYY-MM-DD date
    const yearOrDate = grp(cap("year")(yyyy), opt(dateSeparator, cap("month")(mm), dateSeparator, cap("day")(dd)));

    const group = phrase;

    const subgroupNumber = number("subgroupNumber");

    const plexNumber = grp(
        season, subgroupNumber, episode, number("number"),
        opt(opt(dash), episode, number("endNumber"))
    );

    const twoPartNumber = grp(subgroupNumber, alt(dash, "x"), number("number"));

    const itemNumber = grp(opt(subgroupNumber, alt(dash, "x")), number("number"));

    const subgroup = alt(grp(alt(season, chapter), ws, number("numberFromSubgroupName")), phrase);
    const name = alt(
        grp(alt(episode, track, chapter), ws, number("numberFromName")),
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
    data_?: Data;

    refresh() {
        super.refresh();
        this.data_ = undefined;
    }

    isPrimary(entry: Entry): boolean {
        if (!entry.extension) {
            return false;
        }

        return MEDIA_EXTENSIONS.includes(entry.extension.toLowerCase());
    }

    get unprocessedData(): Data {
        if (this.data_ === undefined) {
            this.data_ = parseData(this.name, standardDataExtractors);
        }
        return this.data_;
    }

    get info(): Data {
        let result = { ...this.unprocessedData };

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

        if (result.subgroupNumber === undefined) {
            if (result.numberFromSubgroupName !== undefined) {
                result.subgroupNumber = result.numberFromSubgroupName;
            }
        }

        if (result.name === undefined) {
            result.name = this.name;
        }

        if (result.name !== undefined) {
            result.name = cleanup(result.name);
        }

        if (result.datelessName === undefined) {
            result.datelessName = result.name;
        } else {
            result.datelessName = cleanup(result.datelessName);
        }

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
     * and that folder hasn't been identified as the group folder. Otherwise there
     * is no subgroup folder.
     */
    get subgroupFolder(): this | undefined {
        const subgroup = this.info.subgroup;
        const parent = this.parent;

        if ((subgroup !== undefined) && (parent !== undefined)) {
            if ((parent.name === subgroup) && (parent !== this.groupFolder)) {
                return parent;
            }
        }

        return undefined;
    }

    /**
     * Searches for matching satellites starting at the current primary and then
     * through ancestor primaries if no match is found at a lower level.
     * 
     * This is useful for images or text descriptions, where you'd like 
     * the specific result for the episode of a TV show, but if none is found, you'd accept
     * a match for the season or the show.
     * 
     * Note that subgroup-related satellites can be found in two ways:
     * 1. As a satellite of the subgroup folder
     * 2. As a satellite of the group folder tagged with the subgroup name
     * 
     * @param extensions Array of extensions to match
     */
    async findSatellites(extensions: string[]): Promise<Satellite<this>[]> {

        const getSatellites = async (primary: this) => {
            const match = (s: Satellite<this>) => {
                return s.extension && extensions.includes(s.extension.toLowerCase());
            };
            return (await primary.satellites()).filter(match);
        };

        // Look for matching satellites of this object.
        // If none, look on the subgroup folder.
        for (const primary of [this, this.subgroupFolder]) {
            if (primary !== undefined) {
                const satellites = await getSatellites(primary);

                if (satellites.length > 0) {
                    return satellites;
                }
            }
        }

        // If no satellites, look for subgroup-tagged satellites on the group folder.
        // If none, return any matching satellites on the group folder.
        const primary = this.groupFolder;
        if (primary !== undefined) {
            const satellites = await getSatellites(primary);

            const subgroup = this.info.subgroup;
            if (subgroup !== undefined) {
                const subgroupSatellites = satellites.filter(s => s.tags.includes(subgroup));
                if (subgroupSatellites.length > 0) {
                    return subgroupSatellites;
                }
            }

            // No subgroup-tagged satellites, so return group satellites
            if (satellites.length > 0) {
                return satellites;
            }
        }

        // Otherwise, return an empty array
        return [];
    }
}
