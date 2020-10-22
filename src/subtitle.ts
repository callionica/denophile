import { iterable } from "./utility.ts";

/**
 * SRT is very similar to a subset of WEBVTT.
 * The main change is to convert commas to periods in the times.
 * 
 * This function does not parse SRT.
 * It just does a simple text replacement.
 */
export function srt2vtt(text: string): string {
    const cueTiming = /(\d{1,2}:\d{1,2}:\d{1,2})(?:,)(\d{1,3} --> \d{1,2}:\d{1,2}:\d{1,2})(?:,)(\d{1,3})/g;

    // Replace comma timings with period timings
    let vtt = text.replace(cueTiming, "$1.$2.$3");

    // Add WEBVTT header if not present
    if (!vtt.startsWith("WEBVTT")) {
        vtt = "WEBVTT\n\n" + vtt;
    }

    return vtt;
}

function ensureFlag(flags: string, flag: string): string {
    return flags.includes(flag) ? flags : flags + flag;
}

function matchAll(str: string, regex: RegExp): Iterable<RegExpExecArray> {
    function* matchAll_() {
        const localCopy = new RegExp(regex, ensureFlag(regex.flags, 'g'));
        let match;
        while (undefined != (match = localCopy.exec(str))) {
            yield match;
        }
    }
    return iterable(matchAll_)();
}

/** RegExp replace all numeric character entities (decimal and hex) */
function replaceEntities(text: string): string {
    const entityRE = /(?:&#)(?<hex>[xX]?)(?<number>\d+)(?:;)/ig;
    // deno-lint-ignore no-explicit-any
    function convertEntity(match: string, hex: string, number: string, offset: number, original: string, groups: any) {
        const base = (hex.length > 0) ? 16 : 10;
        const code = parseInt(number, base);
        return String.fromCharCode(code);
    }
    return text.replace(entityRE, convertEntity);
}

export function ttml2vtt(text: string): string {
    /*
    This is a hugely hacky way to convert TTML to VTT, but it works for our limited inputs
    THIS IS A HUGE HACK THAT DROPS USEFUL FEATURES OF TTML AND WONT WORK WITH ALL INPUTS
    */

    /* Make sure paragraphs are on separate lines so that regex works */
    text = text.replace(/<\/p><p/g, "</p>\n<p");

    var sub = /<p[^>]* begin="(\d{1,2}:\d{1,2}:\d{1,2}[.]\d{1,3})"[^>]* end="(\d{1,2}:\d{1,2}:\d{1,2}[.]\d{1,3})"[^>]*>(.*)<\/p>/g;

    var matches = [...matchAll(text, sub)];

    if (!(matches && matches.length > 0)) {
        return text;
    }

    var re_style = /<style id="([^"]*)"[^>]* tts:color="([^"]*)"[^>]*\/>/g;
    var styles = [...matchAll(text, re_style)].map(m => { return { id: m[1], color: m[2] }; });

    var replacements = [
        { find: /<span tts:color="([^"]*)"[^>]*>/g, replace: "<c.$1>" },
        { find: /<span [^>]*>/g, replace: "<c>" },
        { find: /<\/span>/g, replace: "</c>" },
        { find: /<br\s*\/>/g, replace: "\n" },
        { find: /&quot;/g, replace: `"` },
    ];

    function strip(sub: string) {
        var result = sub;
        replacements.forEach(r => {
            result = result.replace(r.find, r.replace);
        });
        result = replaceEntities(result);
        return result;
    }

    function padTime(time: string) {
        // WEBVTT has exactly 3-digit milliseconds, add zeroes if we have fewer digits
        var pieces = time.split(".");
        if ((pieces.length === 2) && (pieces[1].length < 3)) {
            return time + "0".repeat(3 - pieces[1].length);
        }
        return time;
    }

    var re_styleRef = /<p [^>]*style="([^"]*)"/;
    var vtt = matches.map((match, n) => {
        var styleRef = [...matchAll(match[0], re_styleRef)].map(m => m[1]);
        var wrapStart = "";
        var wrapEnd = "";
        if (styleRef.length > 0) {
            const ref = styleRef[0];
            const style = styles.find(style => style.id === ref);
            if (style) {
                wrapStart = `<c.${style.color}>`;
                wrapEnd = "</c>"
            }
        }
        return `${n + 1}\n${padTime(match[1])} --> ${padTime(match[2])}\n${wrapStart}${strip(match[3])}${wrapEnd}\n\n`;
    });

    return "WEBVTT\n\n" + vtt.join("");
}
