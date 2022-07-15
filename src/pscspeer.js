/*! browser-peers v0.1.0 | Copyright (c) 2020-2022 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */


import { Peer } from "./peer";

/*
 * This peer class supports symmetrical communication between page
 * scripts (PS) and content scripts (CS) in a browser extension, via use
 * of window.postMessage.
 */
export class PsCsPeer extends Peer {

    /*
     * @param name {string} A unique name with which to tell this peer apart
     *   from all others.
     * @param ext_name {string} A name for the browser extension.
     * @param options {
     *   activateOnConstruction: bool (default true)
     *     If true, activate messaging at end of constructor method.
     * }
     */
    constructor(name, ext_name, options) {
        super(name);
        const {
            activateOnConstruction = true
        } = options || {};
        this.ext_name = ext_name;
        this.boundMessageHandler = this.handleMessageEvent.bind(this);
        if (activateOnConstruction) {
            this.activateMessaging();
        }
    }

    activateMessaging() {
        window.addEventListener("message", this.boundMessageHandler);
        console.debug(`PsCsPeer "${this.name}" activated messaging.`);
    }

    deactivateMessaging() {
        window.removeEventListener("message", this.boundMessageHandler);
        console.debug(`PsCsPeer "${this.name}" de-activated messaging.`);
    }

    handleMessageEvent(event) {
        // We listen to message events only if they originated from our own window and origin,
        // and contain a data attribute.
        if (event.source === window && event.origin === window.location.origin && event.data) {
            const wrapper = event.data;
            // Only listen to messages for the right extension and for this peer.
            if (wrapper.extName === this.ext_name && wrapper.to === this.name) {
                super.handleMessage(wrapper);
            }
        }
    }

    // ------------------------------------------------------------------------
    // Override abstract base class methods

    postMessageAsPeer(peerName, wrapper) {
        wrapper.extName = this.ext_name;
        wrapper.to = peerName;
        // Post the message only to windows whose origin is the same as ours.
        window.postMessage(wrapper, window.location.origin);
    }

}
