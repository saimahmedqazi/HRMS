# Allow the server retry window in client acceptance tests

The shared sign-in helper may wait up to 61 seconds on HTTP 429, but the client acceptance suite still has a 60-second test deadline. Give these scenarios room to honor the server response and report when the retry happens.
