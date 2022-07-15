/*! browser-peers v0.1.0 | Copyright (c) 2020-2022 Steve Kieffer | MIT license */
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
 *      const peer = new DedicatedWorkerPeer(worker);
 *
 *  In the worker script (worker.js in this example):
 *
 *      const peer = new DedicatedWorkerPeer(self);
 *
 */
export class DedicatedWorkerPeer extends Peer {

    /*
     * @param iface {Worker, DedicatedWorkerGlobalScope} An interface that has a `postMessage` method,
     *   and an `onmessage` property. On the page side this will be the `Worker` instance with which you
     *   want to communicate, and in the worker script this will be `self`.
     */
    constructor(iface) {
        const [myName, nameOfPeer] = iface instanceof Worker ? ['page', 'worker'] : ['worker', 'page'];
        super(myName);
        this.nameOfPeer = nameOfPeer;
        this.iface = iface;
        this.boundMessageHandler = this.handleMessageEvent.bind(this);
        this.activateMessaging();
    }

    // Convenient way to terminate the Worker, from the page side.
    terminate() {
        if (this.nameOfPeer === 'worker') {
            this.iface.terminate();
        }
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

    /* Shortcut for makeRequest, so that you don't need to pass the name of the peer
     * as the first argument.
     */
    postRequest(handlerDescrip, args, options) {
        return this.makeRequest(this.nameOfPeer, handlerDescrip, args, options);
    }

}
