'use strict';

const path = require('path');
const goblinName = path.basename(module.parent.filename, '.js');
const Goblin = require('xcraft-core-goblin');
const cron = require('node-cron');

const logicState = {
  id: goblinName,
};

const logicHandlers = {};

const scheduledJobs = {};

const quests = {
  init: function* (quest, desktopId) {
    quest.goblin.setX('desktopId', desktopId);

    const busClient = require('xcraft-core-busclient').getGlobal();
    const resp = busClient.newResponse('cron-scheduler', 'token');
    quest.goblin.setX('resp', resp);

    yield quest.me.scheduleAll();
  },

  scheduleAll: function* (quest) {
    const r = quest.getStorage('rethink');
    const cronJobs = yield r.getAll({
      table: 'cronJob',
    });
    for (const cronJob of cronJobs) {
      if (cronJob.enabled) {
        yield quest.me.schedule({cronJobId: cronJob.id});
      }
    }
  },

  schedule: function* (quest, cronJobId) {
    const desktopId = quest.goblin.getX('desktopId');
    const cronJobAPI = yield quest.create(cronJobId, {
      id: cronJobId,
      desktopId,
    });
    const cronJob = yield cronJobAPI.get();

    const enabled = cronJob.get('enabled');
    if (!enabled) {
      return;
    }
    if (scheduledJobs[cronJobId]) {
      // Do not schdule if already scheduled
      return;
    }
    const cronExpr = cronJob.get('cronExpr');
    const resp = quest.goblin.getX('resp');
    const task = cron.schedule(cronExpr, () => {
      resp.command.nestedSend(`${goblinName}.doJob`, {cronJobId}, (err) => {
        if (err) {
          quest.log.err("Cron-scheduler: Error while executing 'doJob'");
          quest.log.err(err);
        }
      });
    });
    scheduledJobs[cronJobId] = task;
  },

  cancelSchedule: function (quest, cronJobId) {
    const task = scheduledJobs[cronJobId];
    if (!task) {
      return;
    }
    task.stop();
    task.destroy();
    delete scheduledJobs[cronJobId];
  },

  doJob: function* (quest, cronJobId) {
    const desktopId = quest.goblin.getX('desktopId');
    const cronJobAPI = quest.getAPI(cronJobId);
    yield cronJobAPI.doJob({desktopId});
  },

  testQuest: function (quest, args) {
    quest.log.dbg(
      `testQuest: ${new Date().toISOString()} ${JSON.stringify(args)}`
    );
  },

  testQuestError: function () {
    throw new Error('Test error');
  },
};

// Register all quests
for (const questName in quests) {
  Goblin.registerQuest(goblinName, questName, quests[questName]);
}

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
