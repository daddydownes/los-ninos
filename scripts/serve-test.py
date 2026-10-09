"""Serve the built fixture with enough pending connections for browser workers."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class TestServer(ThreadingHTTPServer):
    # Python 3.9's default backlog of five can reset parallel browser asset
    # requests on macOS, producing unrelated and misleading network failures.
    request_queue_size = 128


if __name__ == '__main__':
    handler = partial(SimpleHTTPRequestHandler, directory='_site')
    with TestServer(('127.0.0.1', 8765), handler) as server:
        server.serve_forever()
