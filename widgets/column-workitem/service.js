//T:2019-02-27

'use strict';
const {buildWorkitem} = require('goblin-workshop');

const config = {
  type: 'column',
  kind: 'workitem',
};

module.exports = buildWorkitem(config);
