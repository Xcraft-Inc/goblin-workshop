'use strict';

const T = require('goblin-nabu/widgets/helpers/t.js');
const {buildHinter} = require('goblin-elasticsearch');
/**
 * Retrieve the list of available commands.
 *
 * @returns {Object} The list and definitions of commands.
 */
exports.xcraftCommands = function () {
  return buildHinter({
    type: 'cronJob',
    fields: ['info'],
    newWorkitem: {
      name: 'cronJob-workitem',
      newEntityType: 'cronJob',
      description: T('Nouvel tâche planifiée'),
      view: 'default',
      icon: 'solid/pencil',
      mapNewValueTo: 'description',
      kind: 'tab',
      isClosable: true,
      navigate: true,
    },
    title: T('Tâche planifiée'),
    newButtonTitle: T('Nouvel tâche planifiée'),
  });
};
