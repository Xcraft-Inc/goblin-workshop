'use strict';

const T = require('goblin-nabu');
const {buildWizard} = require('goblin-desktop');

const config = {
  name: 'view-json',
  title: T('Voir le JSON'),
  dialog: {
    width: '800px',
  },

  steps: {
    view: {
      buttons: function (quest, buttons) {
        buttons = buttons.delete('main');
        return buttons.set('cancel', {
          text: T('Fermer'),
          grow: '2',
          disabled: false,
        });
      },
    },
  },
};

module.exports = buildWizard(config);
