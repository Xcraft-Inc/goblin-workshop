'use strict';
const {buildWizard} = require('goblin-desktop');

const config = {
  name: 'quest-run',
  title: 'Quest Run',
  dialog: {
    width: '500px',
  },
  steps: {
    prepare: {
      form: {payload: '{}', quest: 'workshop.trash-entities'},
      quest: function() {},
    },
    finish: {
      form: {},
      quest: function*(quest, form) {
        const formatted = form.payload
          .replace(
            /(\w+:)|(\w+ :)/g,
            match => `"${match.substring(0, match.length - 1)}":`
          )
          .replace(
            /('\w+')/g,
            match => `"${match.substring(1, match.length - 1)}"`
          );
        const payload = Object.assign(
          {
            desktopId: quest.getDesktop(),
          },
          JSON.parse(formatted)
        );
        console.log(`Running ${form.quest} with ${JSON.stringify(payload)}`);
        yield quest.cmd(form.quest, payload);
        quest.me.next();
      },
    },
    close: {
      quest: function(quest) {
        quest.me.next();
      },
    },
  },
};

module.exports = buildWizard(config);