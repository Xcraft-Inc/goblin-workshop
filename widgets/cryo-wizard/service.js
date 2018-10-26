'use strict';
const {buildWizard} = require('goblin-desktop');

const config = {
  name: 'cryo',
  title: 'Time machine',
  gadgets: {},
  steps: {
    configure: {
      buttons: function(quest, buttons) {
        return buttons.set('main', {
          glyph: 'brands/stack-overflow',
          text: 'Travel',
          grow: '2',
          disabled: false,
        });
      },
      form: {},
      quest: function*(quest) {
        const ripleyId = `ripley@${quest.goblin.id}`;
        yield quest.create('ripley', {id: ripleyId});

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
        quest.me.next();
      },
    },
  },
};

module.exports = buildWizard(config);
