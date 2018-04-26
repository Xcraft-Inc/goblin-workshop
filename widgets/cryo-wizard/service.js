'use strict';
const {buildWizard} = require('goblin-desktop');

const config = {
  name: 'cryo',
  title: 'Machine temporelle',
  dialog: {
    width: '800px',
    height: '500px',
  },
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
        const ripleyId = `ripley@${quest.goblin.id}`;
        yield quest.create('ripley', {
          id: ripleyId,
        });
        quest.do({
          form: {
            ripleyId,
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
