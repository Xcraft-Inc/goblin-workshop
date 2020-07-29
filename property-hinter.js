'use strict';
//T:2019-04-09

const T = require('goblin-nabu/widgets/helpers/t.js');
const {buildHinter} = require('goblin-elasticsearch');
/**
 * Retrieve the list of available commands.
 *
 * @returns {Object} The list and definitions of commands.
 */
exports.xcraftCommands = function () {
  return buildHinter({
    type: 'property',
    fields: ['info'],
    newWorkitem: {
      name: 'property-workitem',
      description: T('Nouvelle propriété'),
      newEntityType: 'property',
      view: 'default',
      icon: 'solid/pencil',
      mapNewValueTo: 'name',
      kind: 'tab',
      isClosable: true,
      navigate: true,
    },
    title: T('Propriétés'),
    newButtonTitle: T('Nouvelle propriété'),
  });
};
