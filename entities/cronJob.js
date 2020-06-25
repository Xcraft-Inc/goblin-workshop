'use strict';

const {buildEntity} = require('goblin-workshop');
const cron = require('node-cron');

const entity = {
  type: 'cronJob',

  properties: {
    'enabled': {type: 'bool', defaultValue: false},
    'description': {type: 'string', defaultValue: ''},
    'cronExpr': {type: 'string', defaultValue: '0 0 * * *'},
    'job': {
      type: 'object',
      defaultValue: {
        event: '',
        jobType: 'event',
        eventArgs: '',
        goblinId: '',
        questName: '',
        questArgs: '',
      },
    },
    'job.event': {type: 'string', defaultValue: ''},
    'job.jobType': {type: 'string', defaultValue: 'event'},
    'job.eventArgs': {type: 'string', defaultValue: ''},
    'job.goblinId': {type: 'string', defaultValue: ''},
    'job.questName': {type: 'string', defaultValue: ''},
    'job.questArgs': {type: 'string', defaultValue: ''},
    'error': {type: 'string', defaultValue: ''},
  },

  summaries: {
    info: {type: 'string', defaultValue: ''},
    description: {type: 'string', defaultValue: ''},
  },

  buildSummaries: function (quest, entity) {
    const info = entity.get('id');
    return {info, description: info};
  },

  indexer: function (quest, entity) {
    const info = entity.get('meta.summaries.description', '');
    return {info};
  },

  quests: {
    toggleEnabled: function* (quest) {
      const state = quest.goblin.getState();
      const enabled = state.get('enabled');
      if (enabled) {
        yield quest.me.change({path: 'enabled', newValue: false});
        const cronSchedulerAPI = quest.getAPI('cron-scheduler');
        yield cronSchedulerAPI.cancelSchedule({cronJobId: quest.goblin.id});
      } else {
        yield quest.me.change({path: 'error', newValue: ''});
        const error = yield quest.me.checkError();
        if (error) {
          yield quest.me.change({path: 'error', newValue: error});
          return;
        }
        yield quest.me.change({path: 'enabled', newValue: true});
        const cronSchedulerAPI = quest.getAPI('cron-scheduler');
        yield cronSchedulerAPI.schedule({cronJobId: quest.goblin.id});
      }
    },

    checkError: function (quest) {
      const state = quest.goblin.getState();
      const cronExpr = state.get('cronExpr');
      const exprValid = cron.validate(cronExpr);
      if (!exprValid) {
        return 'invalid-cron-expr';
      }
      const job = state.get('job');
      switch (job.get('jobType')) {
        case 'event': {
          try {
            const args = job.get('eventArgs');
            if (args) {
              JSON.parse(args);
            }
          } catch (err) {
            return 'invalid-args';
          }
          break;
        }
        case 'quest': {
          try {
            const args = job.get('questArgs');
            if (args) {
              JSON.parse(args);
            }
          } catch (err) {
            return 'invalid-args';
          }
          break;
        }
        default:
          throw new Error('Unknown job type');
      }
    },

    doJob: function* (quest, desktopId) {
      const state = quest.goblin.getState();
      const enabled = state.get('enabled');
      if (!enabled) {
        return;
      }
      const job = state.get('job');
      switch (job.get('jobType')) {
        case 'event': {
          let args = {};
          if (job.get('eventArgs')) {
            args = JSON.parse(job.get('eventArgs'));
          }
          quest.evt(job.get('event'), {desktopId, ...args});
          break;
        }
        case 'quest': {
          let args = {};
          if (job.get('questArgs')) {
            args = JSON.parse(job.get('questArgs'));
          }
          const API = quest.getAPI(job.get('goblinId'));
          yield API[job.get('questName')]({desktopId, ...args});
          break;
        }
      }
    },
  },

  onNew: function (quest, id) {
    return {
      id,
    };
  },
};

module.exports = {
  entity,
  service: buildEntity(entity),
};
