# Browser Peers

One browser tab talking to another, page scripts talking to content scripts, content scripts talking to
background scripts: time and again, you need a way to pass serializable messages back and forth between
different, isolated javascript contexts.

Furthermore, you don't just want your messages spinning off in space in vague hopes of being heard; you
want to make a request that returns a Promise, which either resolves with a response, or rejects with an error.

One generally thinks of requests as being sent to a "server" that publishes "request handlers". However, the situations
we care about here (page scripts talking to content scripts, etc. etc.) are usually more symmetrical: either side might
wish to initiate a request. Therefore instead of "servers" and "clients," this library provides primarily for "peers".

Peers combine the roles of server and client. When you form a peer, you can register request handlers with it,
so it is ready to act as a server. But it is also able to make requests of another peer, and thus act as client.

## Classes

### `Peer` (`peer.js`)

This is the foundational base class for all our peer classes. It defines most of the basic
functionality, leaving subclasses to implement one or two abstract methods.

### `CsBgsPeer` (`csbgspeer.js`)

This peer class supports symmetrical communication between content
scripts (CS) and background scripts (BGS) in a browser extension, via use
of the browser.runtime.Port class.

Communication is symmetrical in the usual way (either side can initiate a
request, and receive a promise that resolves with a response from the other side).

Establishing connections however is asymmetrical: the peer on the CS side must
open the connection. This is because to go in the other direction would require
use of `browser.tabs`, and we are trying to keep things simple and avoid that.

### `PsCsPeer` (`pscspeer.js`)

This peer class supports symmetrical communication between page
scripts (PS) and content scripts (CS) in a browser extension, via use
of window.postMessage.

### `PsBgsRelay` (`psbgsrelay.js`)

This is not a peer class, but serves to connect a PsCsPeer running in a
page script directly with a CsBgsPeer running in a background script. The
relay itself must be instantiated in a content script.

### `ExtensionClient` and `ExtensionServer` (`ext.js` and `extserver.js`)

These are subclasses of `PsCsPeer` that are specially designed for establishing
and maintaining a connection between a page and a browser extension.

They provide tools to help the extension recognize pages where it is meant to run,
and to help pages detect the presence and version number of the extension.

They also aim to smoothly handle cases where the extension is uninstalled or even
reinstalled after the page has already loaded.

Although they are indeed `PsCsPeer`s -- so either one can initiate a request to the
other -- these classes are called `ExtensionClient` (for use on PS side) and
`ExtensionServer` (for use on CS side), just to give a sense for what they are for,
and where they are meant to be used.

### `WindowPeer` (`windowpeer.js`)

This peer is for communication between different browser tabs, which we call "windows,"
although they may well be tabs in the same browser window. It requires external support
either by a browser extension, or a server. See examples of each approach in our
`examples` directory.
