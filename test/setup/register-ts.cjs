const tsNode = require('ts-node');

tsNode.register({
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'node',
  },
});
