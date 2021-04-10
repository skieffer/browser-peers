/*! browser-peers v0.1.0 | Copyright (c) 2020-2021 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */


const $ = require('jquery');
const io = require('socket.io-client')

import { SocketTransport } from "../../src/transport";
import { makeSimpleDemoPeer } from "../peer_demo";

$(document).ready(function() {

    // Here we must use the same namespace and prefix that we set on the server side:
    const namespace = '/mySocketNamespace';
    const eventNamePrefix = 'myWindowPeersPrefix';

    const socket = io(namespace);
    const transport = new SocketTransport(socket);
    const peer = makeSimpleDemoPeer(transport, eventNamePrefix);
    peer.enable();

});
