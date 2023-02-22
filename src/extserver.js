/*! browser-peers v0.2.1 | Copyright (c) 2020-2023 Steve Kieffer | MIT license */
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
 * The content script should instantiate an ExtensionServer, and then call its
 * `activateOnDocumentReady` method to make it activate as soon as the page is ready.
 *
 * NOTE: Be sure to read the docstring for the `activateOnDocumentReady` method. It returns a
 * promise which you need to pay attention to.
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
        super(name, ext_name, signal_elt_selector, ext_vers_attr, {activateOnConstruction: false});
        this.host_vers_attr = host_vers_attr;
        this.ext_vers_value = browser.runtime.getManifest().version;
        this._addBuiltInHandler('checkVers', this.checkVersHandler.bind(this));
        this._addBuiltInHandler('sendMessage', this.runtimeSendMessage.bind(this));
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

    /* This provides a way for page scripts (via an ExtensionClient) to send a message to
     * the extension's background script. Of course, the BGS must set up listening for this
     * via `browser.runtime.onMessage`.
     *
     * Note: We need this wrapper method (i.e. cannot simply set `browser.runtime.sendMessage`
     * itself as the handler) because we have to filter out the second, `meta` argument.
     * If both args were passed to `browser.runtime.sendMessage`, it would interpret one of
     * these as its optional `options` arg, which would be a bug.
     */
    runtimeSendMessage(args, meta) {
        return browser.runtime.sendMessage(args);
    }

    // --------------------------------------------------------------------------------

    checkHandlingError(reason, wrapper) {
        console.debug(`content script detected error: ${reason} for request: ${wrapper}`);
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

    _conditionalActivation(resolve, reject) {
        const host_vers = this.testForHost();
        const ext_vers = this.testForExtension();
        let msg = `ExtensionServer "${this.name}" constructed at ${this.constructionTime}`;
        // Only if (a) the page _does_ appear to be the intended host, while (b) it does _not_
        // appear that an extension content script has yet activated, do we go ahead and activate.
        if (host_vers !== null && ext_vers === null) {
            // First mark our presence, to stop any others from setting up a redundant server.
            this.markExtensionPresence();
            console.debug(msg + ' chose to activate.');
            this.activateMessaging()
            resolve();
        } else {
            msg += ' declined to activate due to: '
            msg += host_vers === null ? 'Not a host page.' : `Ext "${ext_vers}" already present.`;
            console.debug(msg);
            msg += ' You should ensure your content script removes any event listeners and makes no memory leaks.';
            msg += ' (The ExtensionServer has already removed its own listeners.)';
            reject(msg);
        }
    }

    /* The content script where the ExtensionServer is instantiated should call this to make
     * the server either "activate" as soon as the page is ready, or decline to do so. It will
     * decline either because the page is not a host page, or because the extension has already
     * been activated here.
     *
     * Returns a promise which either _resolves_ when the server activates, or _rejects_ when it
     * declines to do so.
     *
     * The right way to set up your content script therefore is as follows:
     *
     * - Try to make the initialization and activation of the ExtensionServer the first thing
     *   you do.
     *
     * - Pass both a fulfillment handler and a rejection handler to the `then()` of the promise
     *   this method returns.
     *
     * - Use the fulfillment handler to set up anything else the content script needs, in particular
     *   anything that might involve adding event listeners.
     *
     * - If you had to set event listeners _before_ the call to `activateOnDocumentReady()`, be
     *   sure to use the rejection handler to remove these listeners, and take any other
     *   necessary steps to ensure your content script makes no memory leaks.
     *
     * - Even if you have no potential memory leaks to attend to, you should have a rejection
     *   handler anyway, just to suppress the error message, and signal (to other developers)
     *   that you've thought about it.
     *
     * Basically, your content script should be idempotent: running it a second time should not
     * change anything. This is especially critical under Manifest V3, where background scripts
     * are expected to run repeatedly. If your bg script programmatically injects your content
     * script (so that the extension activates immediately on existing tabs, without having to
     * reload them), then your content script too is going to run repeatedly within each tab.
     * Even if you don't do any programmatic injection, you should write your content script
     * carefully, to avoid memory leaks in case of repeated execution.
     *
     */
    activateOnDocumentReady() {
        return new Promise((resolve, reject) => {
            if (document.readyState !== 'loading') {
                this._conditionalActivation(resolve, reject);
            } else {
                /* We're not worried about this event listener as a memory leak.
                 * It will only be added in cases where the content script has run
                 * before the page has finished loading. That is not the "repeated
                 * run" case we are worried about. The latter arises due to background
                 * scripts which may re-inject content scripts when they re-run.
                 */
                document.addEventListener('DOMContentLoaded', _ => {
                    this._conditionalActivation(resolve, reject);
                });
            }
        });
    }

}
