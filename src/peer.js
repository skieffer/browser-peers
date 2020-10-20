/*! browser-peers v0.1.0 | Copyright (c) 2020-2021 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */

import { reconstituteError } from "./errors";

/* This is the abstract base class for all of our peer classes.
 * It implements everything to do with making and handling requests and responses.
 *
 * Subclasses are responsible for establishing connections between peers,
 * and for implementing the abstract `postMessageAsPeer` method defined by this
 * base class.
 *
 */
export class Peer {

    /*
     * @param name {string} a unique name for this peer, to tell it apart
     *   from all others.
     */
    constructor(name) {
        this.name = name;
        this.handlers = new Map();
        this.nextSeqNum = 0;
        this.requestsBySeqNum = new Map();

        this.reconstituteErrors = false;

        this.readyResolve = null;
        const self = this;
        this.readyPromise = new Promise(resolve => {
            self.readyResolve = resolve;
        });

        this.builtInHandlers = new Map()
            .set('ready', this.ready.bind(this))
        ;
        for (let [name, handler] of this.builtInHandlers) {
            this._addHandler(name, handler);
        }

        this.listeners = {};
    }

    // ------------------------------------------------------------------------
    // Events

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
        const cbs = this.listeners[event.type] || [];
        for (let cb of cbs) {
            cb(event);
        }
    }

    copyMessage(msg) {
        return JSON.parse(JSON.stringify(msg));
    }

    // ------------------------------------------------------------------------
    // Message handling

    /* Subclasses should pass incoming request/response wrapper messages to this method.
     *
     * wrapper format: {
     *   type {string} 'request' or 'response'
     * }
     *
     * Furthermore, the wrapper must conform to the required format of `this.handleRequest`
     * or `this.handleResponse`, according to the value of `wrapper.type`.
     *
     */
    handleMessage(wrapper) {
        if (wrapper.type === 'request') {
            this.handleRequest(wrapper);
        } else {
            this.handleResponse(wrapper);
        }
    }

    /*
     * wrapper format: {
     *   from {string} the name of the peer that sent the message,
     *   seqNum {int} sequence number that will be used to associate response with request,
     *   handlerDescrip {string} should be a valid descriptor string pointing to a handler
     *     that has been registered with this peer,
     *   args {any} will be passed to the handler
     * }
     */
    handleRequest(wrapper) {
        const peerName = wrapper.from;
        const seqNum = wrapper.seqNum;
        const handlerDescrip = wrapper.handlerDescrip;
        const args = wrapper.args;
        let handler;
        try {
            handler = this.lookupHandler(handlerDescrip);
        } catch (e) {
            this.returnRejection(peerName, seqNum, e);
            return;
        }
        // Call the handler inside `Promise.resolve` so we can work with it asynchronously,
        // even if the handler returns synchronously.
        Promise.resolve(handler(args)).then(result => {
            this.returnResponse(peerName, seqNum, result);
        }).catch(reason => {
            reason = this.checkHandlingError(reason, wrapper);
            this.returnRejection(peerName, seqNum, reason);
        });
    }

    /*
     * @param peerName {string}
     * @param seqNum {int}
     * @param result {any}
     */
    returnResponse(peerName, seqNum, result) {
        const wrapper = {
            type: 'response',
            from: this.name,
            seqNum: seqNum,
            result: result,
        };
        this.postMessageAsPeer(peerName, wrapper);
    }

    /*
     * @param peerName {string}
     * @param seqNum {int}
     * @param reason: {Error}
     */
    returnRejection(peerName, seqNum, reason) {
        const wrapper = {
            type: 'response',
            from: this.name,
            seqNum: seqNum,
            rejection_reason: reason.message,
        };
        this.postMessageAsPeer(peerName, wrapper);
    }

    consumeRequestData(seqNum) {
        const data = this.requestsBySeqNum.get(seqNum);
        if (data) window.clearTimeout(data.timeoutHandle);  // fails gracefully if timeout already cleared or handle is null
        this.requestsBySeqNum.delete(seqNum);
        return data;
    }

    /*
     * wrapper format: {
     *   REQUIRED:
     *      from {string} the name of the peer that sent the message,
     *      seqNum {int} sequence number that will be used to associate response with request,
     *   EITHER/OR:
     *      result {any} if the call was successful, this is the result to be returned.
     *      rejection_reason {string} if the call failed, this is an indication of the reason.
     * }
     */
    handleResponse(wrapper) {
        const data = this.consumeRequestData(wrapper.seqNum);
        if (!data) {
            // Should only happen if request data already consumed due to timeout.
            // In that case, caller already has their answer. So just do nothing.
            return;
        }
        if (wrapper.rejection_reason) {
            let e = new Error(wrapper.rejection_reason);
            if (this.reconstituteErrors) {
                e = reconstituteError(e);
            }
            data.reject(e);
        } else {
            data.resolve(wrapper.result);
        }
    }

    // ------------------------------------------------------------------------
    // Readiness
    //
    //   To be clear: this means readiness to handle requests, not to accept connections.
    //   A peer instance is immediately ready to accept connections after construction.

    /* Call this when you've finished adding handlers, in order to declare that this
     * peer is ready to handle requests.
     */
    setReady() {
        this.readyResolve();
    }

    /* This is our built-in handler for the 'ready' handler description.
     *
     * It returns a promise that other peers can use to wait until this peer is ready
     * to accept connections.
     */
    ready() {
        return this.readyPromise;
    }

    /* Convenience method to check the readiness of a connected peer.
     */
    checkReady(peerName) {
        return this.makeRequest(peerName, 'ready', {}, false);
    }

    // ------------------------------------------------------------------------
    // Request handlers

    /* Add a handler function or handler object.
     * Handlers may return a value synchronously, or may return a Promise. Either is acceptable.
     * You may not register a handler under a reserved name, i.e. the names of any of our
     * built-in handlers. These are defined in the constructor.
     *
     * @return: this instance, to support chaining.
     */
    addHandler(name, handler) {
        if (this.builtInHandlers.has(name)) {
            throw new Error(`Cannot register handler under reserved name: ${name}`);
        }
        this._addHandler(name, handler);
        return this;
    }

    _addHandler(name, handler) {
        this.handlers.set(name, handler);
    }

    /* Add a "built-in handler," which really means a handler such that an error
     * will be thrown if anyone tries to add a handler by the same name using the
     * usual `addHandler` method.
     *
     * If the language supported it, we would make this a protected method, i.e.
     * usable only by subclasses. So don't use it unless you should!
     */
    _addBuiltInHandler(name, handler) {
        this.builtInHandlers.set(name, handler);
        this._addHandler(name, handler);
    }

    /* Look up a handler, by its description.
     *
     * A handler description should be a string naming something that has been added as a
     * handler for this server, or an attribute thereof, recursively.
     *
     * For example, if `myFunc` is a function, then after
     *      server.addHandler('f', myFunc)
     * 'f' is a valid description.
     *
     * If `myInstance` is an instance of a class that has a `doSomething` method, then
     * after
     *      server.addHandler('foo', myInstance)
     * 'foo.doSomething' is a valid description.
     *
     * @param descrip {string} the description of the handler.
     * @return: the handler. If the description was dotted, then the returned handler function
     *   has the previous object in the chain bound as `this`.
     * @throws: Error if the description does not resolve to anything, or if it does but that
     *   thing is not a function.
     */
    lookupHandler(descrip) {
        const parts = descrip.split('.');
        let first = true;
        let handler;
        let prev;
        for (let part of parts) {
            if (first) {
                first = false;
                handler = this.handlers.get(part);
            } else if (handler) {
                prev = handler;
                handler = handler[part];
            } else {
                break;
            }
        }
        if (!handler) {
            throw new Error(`Unknown handler: ${descrip}`);
        }
        if (typeof handler !== "function") {
            throw new Error(`Handler "${descrip}" is not a function`);
        }
        if (prev) {
            handler = handler.bind(prev);
        }
        return handler;
    }

    /* If you are on the same side as a peer, you can use this method to call
     * one of its handlers directly, instead of within a request/response pair.
     */
    callHandler(handlerDescrip, args) {
        const handler = this.lookupHandler(handlerDescrip);
        return handler(args);
    }

    // ------------------------------------------------------------------------
    // Making requests

    takeNextSeqNum() {
        const n = this.nextSeqNum;
        this.nextSeqNum = n + 1;
        return n;
    }

    /* Send a request to a single peer.
     *
     * @param peerName {string} The name of the peer to which the request should be sent.
     * @param handlerDescrip {string} A description indicating the desired handler for the
     *   request on the other side.
     * @param args {obj} the arguments object to be passed to the handler on the other side.
     *
     * @param options: {
     *   doReadyCheck {bool} optional, default false. Set true if you want to precede
     *     the request with a ready check.
     *   timeout {int} optional, default 0. Set positive if you want the request to timeout
     *     after this many milliseconds. If 0 (or negative), will wait indefinitely.
     *     In case of timeout, the returned promise rejects.
     * }
     *
     * @return {Promise} promise that resolves with the response to the request, or rejects
     *   with an error.
     *
     * See also: `broadcastRequest`.
     */
    makeRequest(peerName, handlerDescrip, args, options) {
        const {
            doReadyCheck = false,
            timeout = 0,
        } = options || {};
        const seqNum = this.takeNextSeqNum();
        const wrapper = {
            type: 'request',
            from: this.name,
            seqNum: seqNum,
            handlerDescrip: handlerDescrip,
            args: args,
        };
        const check = doReadyCheck ? this.checkReady(peerName) : Promise.resolve();
        return check.then(() => {
            return new Promise((resolve, reject) => {
                const timeoutHandle = timeout < 1 ? null : window.setTimeout(() => {
                    const data = this.consumeRequestData(seqNum);
                    if (!data) return; // Request was already handled.
                    reject(new Error('Peer request timed out.'));
                }, timeout);
                this.requestsBySeqNum.set(seqNum, {
                    resolve: resolve,
                    reject: reject,
                    timeoutHandle: timeoutHandle,
                });
                this.postMessageAsPeer(peerName, wrapper);
            });
        });
    }

    /* Broadcast a request to all connected peers (or a subset, by filtering).
     *
     * This just performs multiple requests. Particular subclasses may have more
     * efficient ways of broadcasting that they may prefer to use instead.
     *
     * @param handlerDescrip {string} A description indicating the desired handler for the
     *   request on the other side.
     * @param args {obj} the arguments object to be passed to the handler on the other side.
     *
     * @param options: {
     *   filter {function} optional function mapping peer names to booleans. Allows to
     *     broadcast to a subset of all connected peers, namely those mapping to `true`. If not
     *     provided, all peers are included.
     *   skipReadyChecks {bool} optional, default false. If false we will precede each
     *     request with a readiness check. Set true to skip.
     * }
     *
     * @return {Array[Promise]} array of the promises returned by our `makeRequest` method,
     *   one for each peer to which a request was sent.
     *
     * See also: `makeRequest`.
     *
     * Note: While in the `makeRequest` method the ready check is skipped by default, here the
     *   behavior is the opposite, and the ready checks are performed by default. It is felt that,
     *   rather than being confusing, this caters to normal usage patterns. It will be normal to
     *   be broadcasting to a collection of peers for which we are _not_ carefully maintaining state;
     *   whereas when requesting from a single peer, we are more likely to have already performed an
     *   initial (one-time) ready check ourselves.
     */
    broadcastRequest(handlerDescrip, args, options) {
        const {
            filter = (() => true),
            skipReadyChecks = false
        } = options || {};
        const peerNames = this.getAllPeerNames().filter(filter);
        const responsePromises = [];
        for (let peerName of peerNames) {
            responsePromises.push(this.makeRequest(peerName, handlerDescrip, args, {
                doReadyCheck: !skipReadyChecks,
            }));
        }
        return responsePromises;
    }

    // ------------------------------------------------------------------------
    // Abstract methods subclasses MAY override

    /* Subclasses should override this method if they want to use this
     * base class's `broadcastRequest` method.
     *
     * @return {Array[string]} an Array of the names of all connected peers.
     */
    getAllPeerNames() {
        return [];
    }

    /* This gives a chance to examine and modify a handler error, and possibly
     * have side effects, before the error is returned.
     *
     * @param reason: Error thrown by request handler.
     * @param wrapper: the wrapper message that was being handled.
     * @return: Error instance. May be the same as the given reason, or different.
     */
    checkHandlingError(reason, wrapper) {
        return reason;
    }

    // ------------------------------------------------------------------------
    // Abstract methods subclasses MUST override

    /* This is where subclasses must use their transport-specific method of getting
     * a serializable message from one peer to another.
     *
     * Specifically, the message to be communicated here is one of the "wrapper"
     * messages we use to represent requests and responses. The intention therefore
     * is that it be delivered to the `handleMessage` method of the peer (which should
     * _not_ be overridden, but should be inherited from this base class).
     *
     * @param peerName {string} the name of a connected peer
     * @param wrapper {obj} the wrapper message to be posted to that peer. Format: {
     *   type {string} equal to either 'request' or 'response', appropriately.
     * }
     */
    postMessageAsPeer(peerName, wrapper) {
        //
    }

}
