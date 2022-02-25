/*! browser-peers v0.1.0 | Copyright (c) 2020-2021 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */


import { Peer } from "./peer";

/*
 * This peer class supports communication between a page and a web worker,
 * specifically a *dedicated* worker.
 *
 * Usage:
 *
 *  In the page:
 *
 *      const worker = new Worker('worker.js');
 *      const peer = new DedicatedWorkerPeer('page', worker);
 *
 *  In the worker script (worker.js in this example):
 *
 *      const peer = new DedicatedWorkerPeer('worker', self);
 *
 */
export class DedicatedWorkerPeer extends Peer {

    /*
     * @param name {string} A name for this peer.
     * @param iface {Worker, DedicatedWorkerGlobalScope} An interface that has a `postMessage` method,
     *   and an `onmessage` property. On the page side this will be the `Worker` instance with which you
     *   want to communicate, and in the worker script this will be `self`.
     */
    constructor(name, iface) {
        super(name);
        this.iface = iface;
        this.boundMessageHandler = this.handleMessageEvent.bind(this);
        this.activateMessaging();
    }

    activateMessaging() {
        this.iface.onmessage = this.boundMessageHandler;
    }

    handleMessageEvent(event) {
        const wrapper = event.data;
        super.handleMessage(wrapper);
    }

    // ------------------------------------------------------------------------
    // Override abstract base class methods

    postMessageAsPeer(peerName, wrapper) {
        wrapper.to = peerName;
        this.iface.postMessage(wrapper);
    }

}
