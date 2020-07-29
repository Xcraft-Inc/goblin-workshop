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
    type: 'model',
    fields: ['info'],
    newWorkitem: {
      name: 'model-workitem',
      description: T('Nouveau modèle'),
      newEntityType: 'model',
      view: 'default',
      icon: 'solid/pencil',
      mapNewValueTo: 'type',
      kind: 'tab',
      isClosable: true,
      navigate: true,
    },
    title: T('Modèles'),
    newButtonTitle: T('Nouveau modèle'),
  });
};
