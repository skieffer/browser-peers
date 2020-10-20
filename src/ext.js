/*! browser-peers v0.1.0 | Copyright (c) 2020-2021 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */


const browser = require("webextension-polyfill");
import { ExtensionUnavailableError } from "./errors";
import { PsCsPeer } from "./pscspeer";

/* ----------------------------------------------------------------------------------
 * In this module we define subclasses of PsCsPeer that are specially designed for
 * establishing and maintaining a connection between a page and a browser extension.
 *
 * They provide tools to help the extension recognize pages where it is meant to run,
 * and to help pages detect the presence and version number of the extension.
 *
 * They also aim to smoothly handle cases where the extension is uninstalled or even
 * reinstalled after the page has already loaded.
 *
 * Although they are indeed PsCsPeers -- so either one can initiate a request to the
 * other -- these classes are called ExtensionClient (for use on PS side) and
 * ExtensionServer (for use on CS side), just to give a sense for what they are for,
 * and where they are meant to be used.
 * --------------------------------------------------------------------------------*/


/*
 * Both the ExtensionClient and ExtensionServer classes want to be able to work with
 * what we call "signalling," i.e. setting/reading/clearing certain data attributes
 * on a special DOM element in the page, for the purpose of letting the page and
 * content scripts know about each other's presence, and version numbers.
 *
 * Part of this functionality is common to both classes, while the ExtensionServer
 * adds a few further methods. The BasicSignalling class serves as a common super
 * class, and a place for the common methods to be implemented.
 */
class BasicSignalling extends PsCsPeer {

    constructor(name, ext_name, signal_elt_selector, ext_vers_attr) {
        super(name, ext_name);
        this.signal_elt_selector = signal_elt_selector;
        this.ext_vers_attr = ext_vers_attr;
    }

    /*
     * Try to get the DOM element in the host page that is used for signalling
     * between the host and extension.
     */
    getHostSignallingElement() {
        return document.querySelector(this.signal_elt_selector);
    }

    /*
     * Try to determine whether an extension content script has already activated messaging on the page.
     *
     * return: {string|null} The extension version number detected or else `null`.
     */
    testForExtension() {
        const signalElt = this.getHostSignallingElement();
        if (signalElt) {
            return signalElt.getAttribute(this.ext_vers_attr);
        }
        return null;
    }

    eraseExtensionPresence() {
        const signalElt = this.getHostSignallingElement();
        signalElt.removeAttribute(this.ext_vers_attr);
    }

}

/*
 * Page scripts wishing to use the extension should instantiate this class.
 * This provides a client that can pass requests to, and receive responses from,
 * the extension. It can also receive requests from the extension, and respond.
 *
 * Requests return a promise that either resolves or rejects according to whether
 * the extension is able to return a response or needs to raise an exception.
 */
export class ExtensionClient extends BasicSignalling {

    /*
     * @param name {string} a unique name for this client.
     * @param serverName {string} the name of the ExtensionServer instance with
     *   which we intend to interact.
     *
     * All other parameters are as for the `ExtensionServer` class.
     */
    constructor(name, serverName, ext_name = '', signal_elt_selector, ext_vers_attr) {
        super(name, ext_name, signal_elt_selector, ext_vers_attr);
        this.serverName = serverName;
        this.reconstituteErrors = true;
    }


    // --------------------------------------------------------------------
    // API

    /* It is expected that there will be just a unique ExtensionServer instance for this
     * client to connect to, and that is the one that was named in this ExtensionClient's
     * constructor. Therefore as a convenience we automatically pass the server's name
     * as the `peerName` to the base class's `makeRequest` method.
     */
    makeRequest(handlerDescrip, args, options) {
        return super.makeRequest(this.serverName, handlerDescrip, args, options);
    }

    /*
     * Unlike the `apparentExtensionVersion()` method, which is faulty and only checks for a posted
     * version number (but returns immediately), this method performs an actually robust check for
     * the presence of the extension, on both Firefox and Chrome. It returns a promise that either
     * resolves with the present version number, or rejects if it detects that the extension is absent.
     *
     * On any browser, if the promise is going to resolve -- i.e. if the extension is present -- it will
     * resolve immediately.
     *
     * On Chrome, if the promise is going to reject, that too will happen immediately. This is because
     * when an extension has been uninstalled on Chrome, its content scripts continue running, while any
     * attempt to use `browser.runtime` throws an "Extension context invalidated" error. The ExtensionServer
     * class deliberately uses `browser.runtime` in its version number check, in order to throw this exception.
     *
     * On Firefox, if the promise is going to reject, this will take time. You may set the timeout yourself,
     * or accept the default value. This is because when an extension has been uninstalled on Firefox, its
     * content scripts become immediately inactive. This means the ExtensionServer instance we try to reach
     * simply becomes unresponsive. It is the timeout on our request that tells us the extension is gone.
     *
     * param timeout {int} milliseconds to wait for a response from the ExtensionServer. As discussed
     *   above, this represents the time you will wait for a rejection in Firefox.
     * param selfRepairing {bool} if true, and we detect absence of the extension, we will erase the
     *   extension's presence signal. Defaults to true.
     * return: promise that either resolves with the present version number, or rejects if the extension
     *   is absent.
     */
    checkExtensionPresence({ timeout = 3000, selfRepairing = true }) {
        // Timeout must be positive, since 0 signals "wait forever".
        timeout = Math.max(timeout, 1);
        const client = this;
        return this.makeRequest('checkVers', {}, { timeout: timeout })
            .catch(reason => {
                if (selfRepairing && (reason instanceof ExtensionUnavailableError)) {
                    client.eraseExtensionPresence();
                }
                throw reason;
            });
    }

    /*
     * More descriptive synonym for test method inherited from BasicSignalling class.
     *
     * Attempt to check which version (if any) of the extension is present.
     * Return the version (<string>) of extension that is present, or else `null`.
     *
     * Ordinarily the return value will be non-null only if the extension is actually present;
     * however it could also be the case that the extension was present but has now been uninstalled,
     * while the host page has not yet been reloaded.
     *
     * See also: `checkExtensionVersion()`.
     */
    apparentExtensionVersion() {
        return this.testForExtension();
    }

    /*
     * Convenience method to return a boolean true if the extension's signal is present, false otherwise.
     */
    extensionAppearsToBePresent() {
        return this.testForExtension() !== null;
    }

}

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
