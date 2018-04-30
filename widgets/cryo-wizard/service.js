'use strict';
const {buildWizard} = require('goblin-desktop');

const config = {
  name: 'cryo',
  title: 'Time machine',
  gadgets: {},
  steps: {
    configure: {
      mainButton: function(quest, form) {
        return {
          glyph: 'brands/stack-overflow',
          text: 'Travel',
          grow: '2',
          disabled: false,
        };
      },
      form: {},
      quest: function*(quest) {
        const ripleyFromId = `ripley-from@${quest.goblin.id}`;
        const ripleyToId = `ripley-to@${quest.goblin.id}`;
        yield quest.create('ripley', {
          id: ripleyFromId,
        });
        yield quest.create('ripley', {
          id: ripleyToId,
        });
        quest.do({
          form: {
            ripleyFromId,
            ripleyToId,
          },
        });
      },
    },
    finish: {
      form: {},
      quest: function(quest, form) {
        const desktop = quest.getAPI(quest.getDesktop());
        desktop.removeDialog({dialogId: quest.goblin.id});
      },
    },
  },
};

module.exports = buildWizard(config);
