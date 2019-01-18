'use strict';
const {buildWizard} = require('goblin-desktop');

const config = {
  name: 'entity-flow',
  title: 'EntityFlow',
  dialog: {
    width: '500px',
  },
  steps: {
    prepare: {
      form: {type: 'missionOrder', path: '', action: 'trash'},
      quest: function*(quest) {
        const desktopId = quest.getDesktop();
        const workshopAPI = quest.getAPI('workshop');
        const storageRootPath = yield workshopAPI.getMandateStorageRootPath({
          desktopId,
        });
        if (!storageRootPath) {
          yield quest.me.goto({step: 'close'});
          return;
        }
        quest.do({form: {path: storageRootPath}});
      },
    },
    finish: {
      form: {},
      quest: function*(quest, form) {
        console.log(form.type);
        console.log(form.path);
        console.log(form.action);
        yield quest.cmd(`workshop.${form.action}-entities`, {
          desktopId: quest.getDesktop(),
          type: form.type,
          dataPath: form.path,
        });
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
