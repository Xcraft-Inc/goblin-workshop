//T:2019-02-27

'use strict';
const {buildWorkitem} = require('goblin-workshop');

const config = {
  type: 'property',
  kind: 'workitem',
};

module.exports = buildWorkitem(config);
