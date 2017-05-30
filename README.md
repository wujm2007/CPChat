# CPChat
吴俊旻

A simple encrypted chat web application implemented on node.js , koa.js & socket.io.

## How to Run?

1. Change `SERVER_ADDR` in `client.js`.

2. Change the working directory and input the following command in terminal:
   ```shell
   npm install
   webpack client.js public/js/bundle.js
   npm start
   ```

3. Visit `SERVER_ADDR:8888` in your browser.

## Key Exchange

- Assumption
    - a client always communicates with the right server (own the server's public key)
    - clients and server agree on the same hash function h
    - clients and server agree on the same way to generate a session key (using two random byte buffer)

1. The client generates random bytes (r<sub>a</sub>) and a random integer (n), and sends E(PU<sub>server</sub>, {PU<sub>client</sub>, r<sub>a</sub>, n}) (denoted by `data`) || E(PR<sub>client</sub>, h(`data`)) (denoted by `signature`) to server.
2. Server generates random bytes (r<sub>b</sub>), decrypts `data` and `signature` by PR<sub>server</sub> and PU<sub>client</sub> respectively and sends E(PU<sub>client</sub>, {r<sub>b</sub>, n-1}) (denoted by `data2`) || E(PR<sub>server</sub>, h(`data2`)) (denoted by `signature2`) to the client.
3. Now that the client and server are authenticated mutually, they can use r<sub>a</sub> & r<sub>b</sub> the generate a session key.