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

class MediaEntry {
    entry: Entry;
    parent?: MediaEntry;
    entryChildren_?: Entry[];
    children_?: MediaEntry[];

    refresh() {
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
        const thisName = this.entry.name;
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
}