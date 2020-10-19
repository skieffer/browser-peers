/*! browser-peers v0.1.0 | Copyright (c) 2020-2021 Steve Kieffer | MIT license */
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
