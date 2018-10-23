'use strict';

const searchTemplate = require('./workitems/search.js');
const datagridTemplate = require('./workitems/datagrid.js');
const editorTemplate = require('./workitems/workitem.js');
const pluginTemplate = require('./workitems/plugin.js');

module.exports = config => {
  switch (config.kind) {
    case 'detail':
    case 'editor':
    case 'workitem':
      return editorTemplate(config);
    case 'datagrid':
      return datagridTemplate(config);
    case 'search':
      return searchTemplate(config);
    case 'plugin':
      return pluginTemplate(config);
    default:
      throw new Error(`Unknow workitem kind: ${config.kind}`);
  }
};
