# Flask Window Group Example

This example demonstrates the use of a Flask web server to support a page that uses the WindowPeer class
to communicate between multiple browser tabs/windows.

## Usage

You need to have built the examples. (You only need to do this once for all the examples.)
At the top level of this repo, do:

    $ npm run build_examp

Now in this `examples/wgflask` directory, set up and activate a Python virtual environment:

    $ pythom -m venv venv
    $ . venv/bin/activate
    $ pip install --upgrade pip
    $ pip install -r requirements.txt

(you only have to set it up once; thereafter, just activating with `. venv/bin/activate` is enough).
Then move to the build directory, and start up the webserver.

    (venv) $ cd ../../build/wgflask
    (venv) $ python app.py

By default the server will try to bind to port 5005. You may pass a different port on the command
line if you wish, e.g.:

    (venv) $ python app.py 5050

Then open up a web browser and navigate to `http://localhost:5005/` (or substitute a different port number).
Now try opening up one or two more browser tabs at the same address. Each tab should now state its own window
number, and you should be able to send messages to selected windows, by number.

When you're done testing, you can stop the web server with `Ctrl-C`.

## How it Works

You can examine `app.py` and `index.js` in this directory in order to see what is required on the server side, and
respectively on the client side, in order to make this example work. 