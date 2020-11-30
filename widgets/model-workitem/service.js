'use strict';
const T = require('goblin-nabu/widgets/helpers/t.js');
const {buildWorkitem} = require('goblin-workshop');
const Shredder = require('xcraft-core-shredder');
const {fromJS} = require('immutable');
const buildService = require('./buildService.js');

const config = {
  type: 'model',
  kind: 'workitem',
  buttons: function (quest, mode, status, buttons) {
    buttons = buttons.valueSeq().toArray();
    const buildButton = fromJS({
      id: 'build',
      layout: 'secondary',
      glyph: 'solid/clone',
      text: T('Construire'),
      tooltip: T("Construit l'entité depuis le modèle"),
      quest: 'build',
    });

    buttons.push(buildButton);
    return new Shredder(buttons);
  },
  quests: {
    build: function* (quest) {
      const entityState = yield quest.me.getEntityState();
      buildService(entityState);
      yield quest.cmd(`horde.slave.add`, {appId: 'workshop-userland'});
    },
  },
};

module.exports = buildWorkitem(config);
