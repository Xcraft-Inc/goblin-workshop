'use strict';

const T = require('goblin-nabu');
const {buildWizard} = require('goblin-desktop');

const config = {
  name: 'open-entity',
  title: T('Ouvrir'),
  dialog: {
    width: '800px',
  },

  steps: {
    options: {
      updateButtonsMode: 'onChange',
      buttons: function (quest, buttons, form) {
        const entityId = form.get('entityId', null);
        let disabled = !entityId;
        if (entityId) {
          if (entityId.split('@').length < 2) {
            disabled = true;
          }
        }
        return buttons.set('main', {
          text: T('Ouvrir'),
          grow: disabled ? '0.5' : '2',
          disabled: disabled,
        });
      },
      form: {entityId: null},
    },

    finish: {
      form: {},
      quest: function* (quest, form) {
        const desktopId = quest.getDesktop();
        const deskAPI = quest.getAPI(desktopId);
        const entityId = form.entityId;
        yield deskAPI.addWorkitem({
          desktopId,
          workitem: {
            view: 'default',
            kind: 'tab',
            name: 'entity-workitem',
            payload: {entityId},
          },
          navigate: true,
        });
        yield quest.me.next();
      },
    },
  },
};

module.exports = buildWizard(config);
