// junction.ts provides a view of a file system that allows folders to be combined
// manually using .junction files, and automatically by associating items of the same name
// at the same level of the tree.

// Junction files are text files where each line is a file:// URL pointing to a file or folder.
// Junction files use the `.junction` extension.

// A junction file containing a single file URL makes the junction file
// behave like that file, but with a new name or location.

// A junction file containing multiple folder URLs makes the junction file 
// behave like a folder whose contents are the contents of the specified folders

// Imagine a file system like this:
// ROOT/
//  Images/
//      Image1.jpg
//      Extra/
//          Extra1.dat
//  Texts/
//      Text1.txt
//      Extra/
//          Extra2.dat

// We can get a view that looks like this:
// ROOT/
//  Image1.jpg
//  Text1.txt
//  Extra/
//      Extra1.dat
//      Extra2.dat

// by creating a junction that lists the Images/ and Texts/ folders.

// We can ask to combine the Images/ and Texts/ folders by creating the junction.
// Once we do that, the Images/Extra/ and Texts/Extra/ folders are combined automatically.

import {
    FilePath, FileName,
    directoryEntries, fileName, isFolderPath, readFile, toFileURL
} from "./file.ts";

const JUNCTION_EXTENSION = "junction";
const JUNCTION_MAXIMUM_LENGTH = 32 * 1024; // 32K maximum bytes in a junction file 

type FileURL = URL;

/**
 * An entry in the tree of files and folders.
 */
export interface Entry extends FileName {
    targets: FileURL[];
    isFolder: boolean;
    children(): Promise<Entry[]>;
}

/** Reads lines from a text file and converts them to URL objects */
async function loadJunction(filePath: FilePath): Promise<URL[]> {
    const data = await readFile(filePath, new Uint8Array(JUNCTION_MAXIMUM_LENGTH));
    const text = new TextDecoder().decode(data);
    return text.split("\n").map(url => new URL(url));
}

/**
 * Loads a folder, junction file, or other file as the root entry of a tree
 * that represents the junction-based view of the file system.
 * 
 * Only if filePath represents a junction file will there be an immediate disk access.
 * Otherwise no disk access will occur until `children` is called.
 * 
 * @param filePath The location of the file
 */
export async function loadEntry(filePath: FilePath): Promise<Entry> {
    let url = toFileURL(filePath);

    let name = fileName(url);

    // For an ordinary file, there is one target: the file itself
    let targets = [url];

    // TODO - case sensitivity?
    const isJunction = (name.extension === JUNCTION_EXTENSION);
    if (isJunction) {
        // When we have a junction file, the name of the entry
        // does not include the junction extension
        // Examples:
        //      test.junction -> test
        //      test.pdf.junction -> test.pdf
        // This allows us to match a junction file with a folder by name
        name = fileName(name.name);

        // For a junction, the targets are read from the file
        targets = await loadJunction(url);
    }

    return new Entry_(name, targets);
}

/** Create a junction without writing it to disk */
export function createEntry(name: FileName, targets: FilePath[]) {
    return new Entry_(name, targets.map(toFileURL));
}

class Entry_ implements Entry {
    name: string;
    extension?: string;
    targets: FileURL[];

    constructor(name: FileName, targets: FileURL[]) {
        this.name = name.name;
        this.extension = name.extension;
        this.targets = targets;
    }

    get isFolder(): boolean {
        return this.targets.some(isFolderPath);
    }

    async children(): Promise<Entry[]> {
        // We have to gather all the entries from all the targets
        // so that we can associate them by name which means that
        // this function might have to read many entries from many
        // different locations before we can return a result.

        const result: Entry[] = [];
        for (const target of this.targets.filter(isFolderPath)) {
            for await (const child of directoryEntries(target)) {
                const entry = await loadEntry(child);
                // TODO - case sensitivity
                const found = result.find(existingEntry => (existingEntry.name === entry.name) && (existingEntry.extension === entry.extension));
                if (found) {
                    found.targets.push(...entry.targets);
                } else {
                    result.push(entry);
                }
            }
        }
        return result;
    }
}
