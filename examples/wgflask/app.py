# browser-peers v0.1.0 | Copyright (c) 2020-2021 Steve Kieffer | MIT license
# SPDX-License-Identifier: MIT

import secrets

from flask import Flask, render_template, request, session
from flask_socketio import SocketIO, emit, disconnect, join_room
from flask_socketio import rooms as get_current_rooms

app = Flask(__name__)
app.config['SECRET_KEY'] = secrets.token_urlsafe(32)
socketio = SocketIO(app, async_mode=None)

# ------------------------------------------------------------------------
# Page loaders

@app.route('/')
def index():
    # Need to set the GID now, so all pages get the same one.
    get_gid_from_session()
    return render_template('index.html')

# ------------------------------------------------------------------------
# Window peers protocol

# The SocketIO system has a built-in namespacing feature. You can choose
# whatever namespace you want to use here:
NAMESPACE = '/mySocketNamespace'
# However, if a single socket connection is to be used for more purposes than
# supporting the window peers protocol, you may want to gather the events making
# up the window peers protocol under a sub-namespace. Therefore,
# for another level of namespacing, you can choose any string to be prefixed
# to every event name in the window peers protocol (except the `connect` and
# `disconnect` events, which are part of the basic SocketIO protocol):
PREFIX = 'myWindowPeersPrefix'
# If the built-in namespacing is already enough, you may leave the prefix as
# the empty string.
# Just be sure that you use the same namespace and prefix on the client side.

def get_gid_from_session():
    token = session.get("GID")
    if token is None:
        token = secrets.token_urlsafe(32)
        session["GID"] = token
    return token

@socketio.on('connect', namespace=NAMESPACE)
def on_connect():
    """
    We add all of a user's socket connections to a common room. We want this room
    to have a unique, unguessable name, and we want that name to be recorded in
    the user's Flask session. We call this name the group ID, or GID.

    Note that with Flask-SocketIO, socket handlers always see the Flask session
    as it was at the time the connect event occurred, which is why it is possible
    for us to read an existing GID here in this handler.

    See <https://flask-socketio.readthedocs.io/en/latest/#access-to-flask-s-context-globals>
    """
    token = get_gid_from_session()
    join_room(token, sid=request.sid, namespace=NAMESPACE)

@socketio.on('disconnect', namespace=NAMESPACE)
def on_disconnect():
    sid = request.sid
    current_rooms = get_current_rooms(sid, namespace=NAMESPACE)
    for r in current_rooms:
        emit(PREFIX+'observeDeparture', {'name': sid}, namespace=NAMESPACE, room=r)

@socketio.on(PREFIX+'join', namespace=NAMESPACE)
def join(msg):
    token = get_gid_from_session()
    birthday = msg.get('birthday')
    response = {
        "windowGroupId": token,
        "name": request.sid,
        "birthday": birthday,
    }
    socketio.emit(PREFIX+'hello', response, namespace=NAMESPACE, room=token)

@socketio.on(PREFIX+'depart', namespace=NAMESPACE)
def disconnect_request():
    disconnect()

@socketio.on(PREFIX+'welcome', namespace=NAMESPACE)
def welcome(msg):
    room = msg.get('to', request.sid)
    emit(PREFIX+'welcome', msg, room=room)

@socketio.on(PREFIX+'postWindowMessage', namespace=NAMESPACE)
def postWindowMessage(msg):
    room = msg.get('room', request.sid)
    emit(PREFIX+'handleWindowMessage', msg, room=room)

@socketio.on(PREFIX+'sendWindowEvent', namespace=NAMESPACE)
def sendWindowEvent(wrapper):
    event = wrapper.get('event', {})
    room = wrapper.get('room', request.sid)
    include_self = wrapper.get('includeSelf', True)
    emit(PREFIX+'genericWindowEvent', event, room=room, include_self=include_self)

# ------------------------------------------------------------------------

if __name__ == '__main__':
    import sys
    try:
        port = int(sys.argv[1])
    except:
        port = 5005
    socketio.run(app, port=port)
