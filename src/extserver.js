/*! browser-peers v0.1.0 | Copyright (c) 2020-2021 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */


const browser = require("webextension-polyfill");
import { ExtensionUnavailableError } from "./errors";
import { BasicSignalling } from "./ext";

/* ----------------------------------------------------------------------------------
 * Note: The ExtensionServer class must be defined in a separate module from the
 * ExtensionClient. This is because (a) page scripts need to import the ExtensionClient
 * module, while (b) the ExtensionServer needs to use the webextension-polyfill library,
 * and (c) if a page script tries to import (any module that imports) that library, you
 * will get a console error saying,
 *   "This script should only be loaded in a browser extension."
 * and your page will not load!
 * --------------------------------------------------------------------------------*/

/*
 * Together with the `ExtensionClient` class, this class supports promise-based
 * messaging between page scripts and content scripts.
 *
 * A content script is expected to use only one ExtensionServer, since this class takes
 * steps to ensure only one is running on the page at any given time. (This is to support
 * uninstall/reinstall of the extension, as well as injection after the page is already
 * loaded.)
 *
 * The content script should instantiate an ExtensionServer, and then call the latter's
 * `activateOnReady` method to make it activate as soon as the page is ready.
 *
 * Under this design, the extension's background script is free to actively inject the
 * content script into host pages. The ExtensionServer (on Chrome) or ExtensionClient
 * (on Firefox) will see to it that the content script becomes deactivated if the extension
 * is uninstalled.
 */
export class ExtensionServer extends BasicSignalling {

    /*
     * @param name {string} a unique name for this server.
     * @param ext_name {string} a unique name for the extension. This allows the client to direct requests
     *   at the right server.
     * @param signal_elt_selector {string} CSS selector for the "signalling element," i.e. a DOM element
     *   that is expected to be present in any page ("host page") where the extension is
     *   meant to be accessible
     * @param ext_vers_attr {string} the name of a data attribute where the version number of the extension
     *   is to be posted on the signalling element
     * @param host_vers_attr {string} the name of a data attribute of the signalling element where the version
     *   number of the host page will be available
     */
    constructor(name, ext_name = '', signal_elt_selector, ext_vers_attr, host_vers_attr) {
        super(name, ext_name, signal_elt_selector, ext_vers_attr);
        this.host_vers_attr = host_vers_attr;
        this.ext_vers_value = browser.runtime.getManifest().version;
        this._addBuiltInHandler('checkVers', this.checkVersHandler.bind(this));
        this._addBuiltInHandler('sendMessage', browser.runtime.sendMessage);
    }

    // --------------------------------------------------------------------------------
    // Built-in handlers

    /*
     * @return: promise that resolves with the version number of the extension {string},
     *   as read from the extension manifest.
     *
     * Important: we deliberately make use of `browser.runtime` here. This is not just a
     * handy way to read the version number out of the manifest; it is critical that we
     * attempt to make use of the "extension context" so that, on Chrome, we will get a
     * signal that the extension context has been invalidated, if indeed it has (as happens
     * if the extension is uninstalled after page load).
     */
    checkVersHandler() {
        return new Promise((resolve, reject) => {
            const manifest = browser.runtime.getManifest();
            resolve(manifest.version);
        });
    }

    /* Note: the other built-in handler, 'sendMessage', is just a route straight to
     * `browser.runtime.sendMessage`, and thus provides a way for page scripts (via
     * an ExtensionClient) to send a message to the extension's background script.
     * Of course, the BGS must set up listening for this via `browser.runtime.onMessage`.
     */

    // --------------------------------------------------------------------------------

    checkHandlingError(reason, wrapper) {
        //console.log(`content script detected error: ${reason} for request: ${wrapper}`);
        if (reason.message === "Extension context invalidated.") {
            /* In Chrome this happens if the browser extension has been uninstalled or deactivated.
             * This provides a way for the content script to automatically disable itself, at
             * least in Chrome. To be precise, we want to deactivate this content script, and
             * erase the signal of the extension's presence. This (a) prevents further useless
             * activity, and (b) allows a newly-injected content script to become active should the
             * extension be reinstalled.
             *
             * For Firefox, the client will have to be smarter, since there the content script
             * too (not just the background script) becomes unreachable as soon as the extension
             * is uninstalled. An appropriate test for this purpose has been implemented in
             * `ExtensionClient.checkExtensionPresence`.
             */
            this.deactivateMessaging();
            this.eraseExtensionPresence();
            const e = new ExtensionUnavailableError(reason);
            reason = new Error(e.serialize());
        }
        return reason;
    }

    // --------------------------------------------------------------------------------
    // Initial Setup

    /*
     * Try to determine whether the page we're looking at is the intended host page.
     *
     * @return {string|null} The host version number detected or else `null`.
     */
    testForHost() {
        const signalElt = this.getHostSignallingElement();
        if (signalElt) {
            return signalElt.getAttribute(this.host_vers_attr);
        }
        return null;
    }

    /*
     * Make the mark that indicates that this content script is the first (from this extension)
     * to activate messaging on this page.
     */
    markExtensionPresence() {
        const signalElt = this.getHostSignallingElement();
        signalElt.setAttribute(this.ext_vers_attr, this.ext_vers_value);
    }

    conditionalActivation() {
        const host_vers = this.testForHost();
        const ext_vers = this.testForExtension();
        // Only if (a) the page _does_ appear to be the intended host, while (b) it does _not_
        // appear that an extension content script has yet activated messaging, do we go ahead and
        // activate messaging.
        if (host_vers !== null && ext_vers === null) {
            // First make our mark to stop any others from setting up redundant messaging.
            this.markExtensionPresence();
            this.activateMessaging();
        }
    }

    /* The content script where the ExtensionServer is instantiated should call this to make
     * the server "activate" as soon as the page is ready.
     */
    activateOnReady() {
        if (document.readyState !== 'loading') this.conditionalActivation();
        else document.addEventListener('DOMContentLoaded', this.conditionalActivation.bind(this));
    }

}
