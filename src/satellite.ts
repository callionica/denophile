import type { FileName } from "./file.ts";
// satellite.ts provides a view over a file system that reveals associations between files.
// Some files are Primaries and some are Satellites.
// A Satellite's file name starts with the name of a Primary
// and is a sibling of the Primary (if the Primary is a file or folder)
// or a child of the Primary (if the Primary is a folder).
// Files that are prefixed with "folder" are also satellites of their parent folder.
// A satellite may have tags which are period-separated strings appended to the name of the file.
// One of these tags can indicate the primary language of the satellite.

import type { Entry } from "./junction.ts";
import { generable } from "./utility.ts";

function first<Item, Result>(iterable: Iterable<Item>, testAndMap: (item: Item) => (Result | undefined)): Result | undefined {
    let result: Result | undefined;
    for (const item of iterable) {
        if (undefined !== (result = testAndMap(item))) {
            break;
        }
    }
    return result;
}

function hasPrefix(entry: Entry, prefix: string) {
    const length = prefix.length;
    const name = entry.name;
    return name.startsWith(prefix) && ((name.length === length) || (name[length] === "."));
}

export class Satellite<T extends Primary> {
    primary: T;
    entry: Entry;
    tags: string[];

    constructor(primary: T, entry: Entry) {
        this.primary = primary;
        this.entry = entry;

        const name = hasPrefix(entry, this.primary.name) ? this.primary.name : FOLDER_NAME;
        const remainder = this.entry.name.substring(name.length);
        this.tags = remainder.split(".").filter(x => x !== "");
    }

    get name(): string {
        return this.entry.name;
    }

    get extension(): string | undefined {
        return this.entry.extension;
    }

    get target(): URL {
        return this.entry.targets[0];
    }

    get isFolder(): boolean {
        return this.entry.isFolder;
    }

    /** The primary language of this satellite resource */
    get language(): string {

        function tag2language(tag: string): string | undefined {
            const languageTag = tag.toLowerCase();
            const data = [
                ["en", "en-us", "en-gb", "english"],
                ["da", "da-dk", "dansk", "dansk1", "dansk2", "kommentar", "non-dansk", "danish"],
                ["de", "de-de", "deutsch", "german"],
                ["no", "norsk", "norwegian"],
                ["sv", "sv-se", "se", "svenska", "swedish"],
                ["fr", "français", "francais", "french"],
                ["es", "espagnol", "spanish"],
            ];

            const language = first(data, languageTags => {
                if (languageTags.indexOf(languageTag) >= 0) {
                    return languageTags[0];
                }
            });

            return language;
        }

        function tags2language(tags: string[]): string {
            const language = first(tags, tag2language);
            return language || "en";
        }

        return tags2language(this.tags);
    }
}

const FOLDER_NAME = "folder";

export class Primary {
    entry: Entry;
    parent?: this;
    entryChildren_?: Entry[];
    children_?: this[];

    get name(): string {
        return this.entry.name;
    }

    get extension(): string | undefined {
        return this.entry.extension;
    }

    get isFolder(): boolean {
        return this.entry.isFolder;
    }

    // deno-lint-ignore getter-return
    get root(): this {
        // deno-lint-ignore no-this-alias
        let primary = this;
        while (true) {
            if (primary.parent !== undefined) {
                primary = primary.parent;
            } else {
                return primary;
            }
        }
    }

    /**
     * Resolve a path starting from the current item
     * @param path The list of file or folder names to follow
     */
    async resolve(path: Iterable<FileName>): Promise<this | undefined> {
        // deno-lint-ignore no-this-alias
        let current = this;
        for (const piece of path) {
            const next = (await current.children()).find(child =>
                (child.name === piece.name) && (child.extension === piece.extension)
            );
            if (next === undefined) {
                return undefined;
            }
            current = next;
        }
        return current;
    }

    refresh() {
        this.entryChildren_ = undefined;
        this.children_ = undefined;
    }

    constructor(entry: Entry, parent?: Primary) {
        this.entry = entry;
        this.parent = parent as this;
    }

    /**
     * Override isPrimary to customize what files and folders can be primaries.
     * By default, anything with a name can be a primary.
     * Being a primary doesn't prevent the item also being a satellite.
     */
    isPrimary(entry: Entry): boolean {
        return entry.name.length > 0;
    }

    /**
     * Override createChild if you want to customize the objects used to represent children.
     * 
     * You don't need to override createChild if all objects in the tree are of the same type,
     * because the default implementation will create a new object that is the same type as the
     * current instance.
     * 
     * @param c The Entry which is being wrapped
     */
    createChild(c: Entry): this {
        type ctorType = { new <T extends Primary>(entity: Entry, parent?: T): T };
        const ctor = this.constructor as ctorType;
        return new ctor(c, this);
    }

    async entryChildren(): Promise<Entry[]> {
        if (this.entryChildren_ === undefined) {
            this.entryChildren_ = await this.entry.children();
        }

        return this.entryChildren_;
    }

    /**
     * The folders and primaries that are direct children of this object.
     */
    async children(): Promise<this[]> {
        if (this.children_ === undefined) {
            const c = await this.entryChildren();
            this.children_ = c.filter(c => c.isFolder || this.isPrimary(c)).map(c => this.createChild(c));
        }

        return this.children_;
    }

    /**
     * The folders and primaries that are descendants of this object.
     */
    descendants(): AsyncIterable<this> {
        // deno-lint-ignore no-this-alias
        const self = this;

        async function* descendants_() {
            const kids = await self.children();
            for (const kid of kids) {
                yield kid;
                yield* kid.descendants();
            }
        }

        return generable(descendants_)();
    }

    async satellites(): Promise<Satellite<this>[]> {
        let result: Satellite<this>[] = [];

        if (this.parent != undefined) {
            const parentChildren = await this.parent.entryChildren();
            const siblingSatellites = parentChildren.filter(e => (!e.isFolder) && (e !== this.entry) && hasPrefix(e, this.name));
            result = siblingSatellites.map(s => new Satellite(this, s));
        }

        if (this.isFolder) {
            const children = await this.entryChildren();
            const childSatellites = children.filter(e => (!e.isFolder) && (e !== this.entry) && (hasPrefix(e, this.name) || hasPrefix(e, FOLDER_NAME)));
            result.push(...childSatellites.map(s => new Satellite(this, s)));
        }

        return result;
    }
}
