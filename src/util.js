/*! browser-peers v0.1.0 | Copyright (c) 2020-2022 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */

/* Simple XMLHttpRequest utility
 *
 * param url: the url to be accessed
 * optional params object:
 *      method: "GET", "POST" etc. Defaults to "GET"
 *      query: pass an object defining key-value pairs that you want added
 *          as a query string on the end of the URL
 *      form: pass an object defining key-value pairs that you want to be
 *          sent in form-encoded format in the body of the request
 *      handleAs: 'text', 'json', or 'blob'. Defaults to 'text'
 *
 * return: promise that resolves with the response from the request
 */
export function xhr(url, params) {
    if (params.query) {
        url += "?"+(new URLSearchParams(params.query)).toString();
    }
    const init = {
        method: params.method || "GET"
    };
    if (params.form) {
        init.body = new URLSearchParams(params.form);
    }
    const handleAs = params.handleAs || 'text';
    return fetch(url, init).then(resp => {
        if (!resp.ok) {
            throw new Error(`HTTP error! status: ${resp.status}`);
        }
        if (handleAs === 'json') {
            return resp.json();
        } else if (handleAs === 'blob') {
            return resp.blob();
        } else {
            return resp.text();
        }
    });
}

/* Add extra key-value arguments to an XHR.
 *
 * @param givenParams: a `params` arg which would have been passed to the
 *   `xhr` function defined in this module.
 * @param extraPairs: an object defining extra key-value args that you want to
 *   add to the request.
 * @return: a _new_ params object. The given one is not modified.
 *   The extra pairs are placed in `params.query` if `query` was defined in the
 *   givenParams, else in `params.form` if that was defined. If neither was defined,
 *   then we define `params.query` and put the extra pairs in there.
 */
export function enrichXhrParams(givenParams, extraPairs) {
    const params = {};
    Object.assign(params, givenParams || {});
    if (params.query) {
        Object.assign(params.query, extraPairs);
    } else if (params.form) {
        Object.assign(params.form, extraPairs);
    } else {
        params.query = {};
        Object.assign(params.query, extraPairs);
    }
    return params;
}

export class Listenable {

    constructor(listeners) {
        this.listeners = listeners;
    }

    on(eventType, callback) {
        const cbs = this.listeners[eventType] || [];
        cbs.push(callback);
        this.listeners[eventType] = cbs;
    }

    off(eventType, callback) {
        const cbs = this.listeners[eventType] || [];
        const i0 = cbs.indexOf(callback);
        if (i0 >= 0) {
            cbs.splice(i0, 1);
            this.listeners[eventType] = cbs;
        }
    }

    dispatch(event) {
        /* Subtle point: In general, we are always careful not to modify an
         * iterable while we are in the process of iterating over it. Here, we don't
         * know whether a callback might `off` itself as a part of its process,
         * thereby modifying our array of listeners while we are iterating over it!
         * Therefore, to be safe, we have to iterate over a _copy_ of our array of
         * registered listeners. */
        const cbs = (this.listeners[event.type] || []).slice();
        for (let cb of cbs) {
            cb(event);
        }
    }

}