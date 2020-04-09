module.exports = (type) => `'use strict';

const T = require('goblin-nabu/widgets/helpers/t.js');
const {buildHinter} = require('goblin-elasticsearch');
/**
 * Retrieve the list of available commands.
 *
 * @returns {Object} The list and definitions of commands.
 */
exports.xcraftCommands = function() {
  return buildHinter({
    type: '${type}',
    fields: ['info'],
    newWorkitem: {
      name: '${type}-workitem',
      newEntityType: '${type}',
      description: T('Nouveau ${type}'),
      view: 'default',
      icon: 'solid/pencil',
      mapNewValueTo: 'name',
      kind: 'tab',
      isClosable: true,
      navigate: true,
    },
    title: T('${type}'),
    newButtonTitle: T('Nouveau ${type}'),
  });
};`;
