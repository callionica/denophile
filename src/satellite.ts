// satellite.ts provides a view over a file system that reveals associations between files
// Some files are Primaries and some are Satellites
// A Satellite's file name starts with the name of a Primary
// and is a sibling of the Primary (if the Primary is a file or folder)
// or a child of the Primary (if the Primary is a folder)
// Files that are prefixed with "folder" are also satellites of their parent folder.
// A satellite may have tags which are period-separated strings appended to the name of the file.

import type { Entry } from "./junction.ts";

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

    refresh() {
        this.entryChildren_ = undefined;
        this.children_ = undefined;
    }

    constructor(entry: Entry, parent?: Primary) {
        this.entry = entry;
        this.parent = parent as this;
    }

    isPrimary(entry: Entry): boolean {
        // Anything with a name can be a primary
        // (It could also be a satellite of some other primary)
        return entry.name.length > 0;
    }

    createChild(c: Entry) : this {
        type ctorType = { new<T extends Primary>(entity: Entry, parent?: T) : T};
        const ctor = this.constructor as ctorType;
        return new ctor(c, this);
    }

    async entryChildren(): Promise<Entry[]> {
        if (this.entryChildren_ === undefined) {
            this.entryChildren_ = await this.entry.children();    
        }
        
        return this.entryChildren_;
    }

    async children(): Promise<this[]> {
        if (this.children_ === undefined) {
            const c = await this.entryChildren();
            this.children_ = c.filter(c => c.isFolder || this.isPrimary(c)).map(c => this.createChild(c));
        }
        
        return this.children_;
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
