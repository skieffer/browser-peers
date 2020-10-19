# Browser Peers

One browser tab talking to another, page scripts talking to content scripts, content scripts talking to
background scripts: time and again, you need a way to pass serializable messages back and forth between
different, isolated javascript contexts.

Furthermore, you don't just want your messages spinning off in space in vague hopes of being heard; you
want to make a request that returns a Promise, which either resolves with a response, or rejects with an error.

One generally thinks of requests as being sent to a "server" that publishes "request handlers". However, the situations
we care about here (page scripts talking to content scripts, etc. etc.) are usually more symmetrical: either side might
wish to initiate a request. Therefore instead of "servers" and "clients," this library provides for "peers".

Peers combine the roles of server and client. When you form a peer, you can register request handlers with it,
so it is ready to act as a server. But it is also able to make requests of another peer, and thus act as client.

