# CPChat
吴俊旻

A dummy chat web application implemented on node.js. (Following an example in [Node.js in Action, Second Edition](https://www.manning.com/books/node-js-in-action-second-edition))

## How to Run?

1. Change `SERVER_ADDR` in `client.js`.

2. Change the working directory and input the following command in terminal:
   ```shell
   webpack client.js public/js/bundle.js
   npm install
   node server
   ```

3. Visit `SERVER_ADDR:8888` in your browser.