'use strict';

const goblinName = 'quest-runner';
const Goblin = require('xcraft-core-goblin');

// Define initial logic values
const logicState = {
  id: goblinName,
};

// Define logic handlers according rc.json
const logicHandlers = {};

Goblin.registerQuest(goblinName, 'init', function(quest) {
  console.log('\x1b[32m%s\x1b[0m', 'Goblin-Workshop: Quest Runner [RUNNING]');
});

Goblin.registerQuest(goblinName, 'run', function*(
  quest,
  runId,
  goblinId,
  questToRun,
  desktopId,
  feeds,
  $msg
) {
  quest.log.verb(`QuestRunner: running  ${questToRun} ...`);
  const id = goblinId;
  try {
    const goblinName = Goblin.getGoblinName(id);
    const created = yield quest.warehouse.attachToParents({
      branch: id,
      parents: quest.goblin.id,
      feeds,
    });
    if (!created) {
      throw new Error(
        `QuestRunner: cannot run ${questToRun}, goblin ${id} has just disapear before run`
      );
    }
    const res = yield quest.cmd(
      `${goblinName}._$${questToRun}`,
      Object.assign(
        {id},
        Object.keys($msg.data)
          .filter(k => k.startsWith('$param-'))
          .reduce((payload, key) => {
            payload[key.replace('$param-', '')] = $msg.data[key];
            return payload;
          }, {})
      )
    );
    quest.log.verb(`QuestRunner: running  ${questToRun} [DONE]`);
    return res;
  } catch (ex) {
    quest.log.err(
      `QuestRunner: running  ${questToRun} [FAILED], ${ex.stack ||
        ex.message ||
        ex}`
    );
  } finally {
    yield quest.kill([id]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
