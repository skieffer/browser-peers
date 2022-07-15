/*! browser-peers v0.1.0 | Copyright (c) 2020-2022 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */

import {PsCsPeer} from "./pscspeer";
import {CsBgsPeer} from "./csbgspeer";

/* Use an instance of this class in your content script, to allow your page script
 * to talk to your background script.
 */
export class PsBgsRelay {

    /* Suppose in your page script you have a PsCsPeer P, and you would like it to
     * communicate with a CsBgsPeer B running in a background script. Then the
     * arguments passed to this constructor should be as follows:
     *
     * @param bgsPeerName: this should be equal to B.name
     * @param psPeerName: this should be equal to P.name
     * @param ext_name: this should be equal to P.ext_name
     *
     * This instance should be defined in a content script of the extension, running
     * in the page where P lives. Then P can make requests of a peer named `${B.name}`,
     * and these requests will be forwarded to B, and the responses returned to P.
     * Likewise, B can make requests of a peer named `${P.name}` and these will
     * be forwarded to P, and the responses returned to B.
     *
     * NOTE: You must call this class's `ready()` method, and wait for the returned
     * promise to resolve, before communication can begin.
     */
    constructor(bgsPeerName, psPeerName, ext_name) {
        this.psPeerName = psPeerName;
        this.bgsPeerName = bgsPeerName;
        this.psCsPeer = new PsCsPeer(bgsPeerName, ext_name);
        this.csBgsPeer = new CsBgsPeer(psPeerName);
        this.psCsPeer.setReady();
        this.csBgsPeer.setReady();

        this.psCsPeer.handleRequest = wrapper => {
            this.handleRequest(wrapper, this.bgsPeerName, this.csBgsPeer, this.psCsPeer);
        };
        this.csBgsPeer.handleRequest = wrapper => {
            this.handleRequest(wrapper, this.psPeerName, this.psCsPeer, this.csBgsPeer);
        };
    }

    connect() {
        this.csBgsPeer.openConnection(this.bgsPeerName);
    }

    /*
     * @return: promise that resolves when both peers are connected and ready.
     */
    ready() {
        return Promise.all([
            this.psCsPeer.checkReady(this.psPeerName),
            this.csBgsPeer.checkReady(this.bgsPeerName)
        ]);
    }

    handleRequest(wrapper, serverName, serverSide, clientSide) {
        const peerName = wrapper.from;
        const seqNum = wrapper.seqNum;
        const handlerDescrip = wrapper.handlerDescrip;
        const args = wrapper.args;
        serverSide.makeRequest(serverName, handlerDescrip, args)
            .then(result => {
                clientSide.returnResponse(peerName, seqNum, result);
            })
            .catch(reason => {
                clientSide.returnRejection(peerName, seqNum, reason);
            });
    }

}
