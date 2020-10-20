/*! browser-peers v0.1.0 | Copyright (c) 2020-2021 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */

/*
 * Here we define special error classes that are designed to be serializable.
 * This is so that they can be communicated via various messaging systems,
 * and then reconstructed on the other side.
 *
 * All error classes defined here MUST:
 *
 *   * have a constructor that accepts an object
 *
 *   * define `this.name` equal to their own class name (as string!)
 *
 *   * be registered in `KNOWN_ERROR_CLASSES` (see below) under their class name
 *
 *   * have a `serialize()` method that returns the JSON.stringify of an
 *     object that:
 *       - can be passed to the class's constructor, and
 *       - includes `_error_class_name: this.name`
 *
 */

// ---------------------------------------------------------------------------
// Special error classes

/*
 * This error class is intended to represent cases in which the extension has
 * become unavailable. Usually (actually the only case I'm currently aware of)
 * this is because the extension was uninstalled after that page was loaded.
 */
export class ExtensionUnavailableError extends Error {

    constructor({ message }) {
        super(message);
        this.name = "ExtensionUnavailableError";
    }

    serialize() {
        return JSON.stringify({
            _error_class_name: this.name,
            message: this.message,
        });
    }

}

/*
 * This represents cases in which the extension is lacking host permission
 * for a given URL.
 */
export class LackingHostPermissionError extends Error {

    constructor({ url }) {
        super(`Extension lacks host permission for ${url}.`);
        this.name = "LackingHostPermissionError";
        this.url = url;
    }

    serialize() {
        return JSON.stringify({
            _error_class_name: this.name,
            url: this.url,
        });
    }
}

/*
 * Superclass of more specific fetch error types defined below.
 * For now, not exported, since I think users only need the more specific types.
 */
class FetchError extends Error {

    /* We record those attributes of a fetch Response object
     * (see <https://developer.mozilla.org/en-US/docs/Web/API/Response>)
     * that we think will be useful (and that we want to bother with right
     * now -- maybe more in the future).
     *
     * Note that you may pass a Response instance itself to this constructor.
     */
    constructor({ ok, status, statusText, type, url, headers, contentType }) {
        const message = `Fetch ${url} status: ${status} ${statusText}`;
        super(message);
        this.name = 'FetchError';
        this.ok = ok;
        this.status = status;
        this.statusText = statusText;
        this.type = type;
        this.url = url;
        this.contentType = contentType;
        if (headers && headers.get) {
            try {
                this.contentType = headers.get('Content-Type');
            } catch (e) {
            }
        }
    }

    serialize() {
        return JSON.stringify({
            _error_class_name: this.name,
            ok: this.ok,
            status: this.status,
            statusText: this.statusText,
            type: this.type,
            url: this.url,
            contentType: this.contentType,
        });
    }

}

/*
 * This error class is intended to represent cases in which a `fetch` promise
 * resolved, but returned a Response object whose `ok` property was `false`.
 *
 * On both Chrome and Firefox, this will be the case when we successfully
 * received a response, but it had an HTTP status outside the 200-299 range.
 */
export class FetchResolvedNotOkError extends FetchError {

    constructor({ ok, status, statusText, type, url }) {
        super({ ok, status, statusText, type, url });
        this.name = 'FetchResolvedNotOkError';
    }

}

/*
 * This error class is intended to represent cases in which a `fetch` promise rejected.
 *
 * For example, on both Chrome and Firefox, this will be the case when we attempt to make a
 * cross-origin fetch, but CORS fails due to absence of Access-Control-Allow-Origin header.
 */
export class FetchRejectedError extends FetchError {

    constructor({ ok, status, statusText, type, url }) {
        super({ ok, status, statusText, type, url });
        this.name = 'FetchRejectedError';
        this.message = 'Fetch rejected. ' + this.message;
    }

}

/*
 * Represents cases in which a `fetch` resolved with `ok` but with an unexpected
 * Content-Type header.
 */
export class FetchWrongContentTypeError extends FetchError {

    constructor({ ok, status, statusText, type, url, headers, contentType }) {
        super({ ok, status, statusText, type, url, headers, contentType });
        this.name = 'FetchWrongContentTypeError';
        this.message = `Fetch ${url} received unexpected Content-Type: ${contentType}`;
    }

}

// ---------------------------------------------------------------------------
// Reconstitution

const KNOWN_ERROR_CLASSES = new Map()
    .set("FetchResolvedNotOkError", FetchResolvedNotOkError)
    .set("FetchRejectedError", FetchRejectedError)
    .set("ExtensionUnavailableError", ExtensionUnavailableError)
    .set("LackingHostPermissionError", LackingHostPermissionError)
    .set("FetchWrongContentTypeError", FetchWrongContentTypeError)
;

/* Attempt to reconstitute a special error class instance from a generic Error.
 * We look at the message of the given Error. If it appears to be the serialization
 * of one of our special error classes, then we rebuild an instance based on this.
 * Otherwise we just return the given Error.
 *
 * param error: an Error instance
 * return: the reconstituted error, or the given one.
 */
export function reconstituteError(error) {
    let d = null;
    try {
        d = JSON.parse(error.message);
    } catch {}
    if (d && KNOWN_ERROR_CLASSES.has(d._error_class_name)) {
        const ClassConstructor = KNOWN_ERROR_CLASSES.get(d._error_class_name);
        return new ClassConstructor(d);
    }
    return error;
}
