'use strict';

const goblinName = 'quest-runner';
const Goblin = require('xcraft-core-goblin');
const {helpers} = require('xcraft-core-transport');
function jsifyQuestName(quest) {
  return quest.replace(/-([a-z])/g, (m, g1) => g1.toUpperCase());
}
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
  $msg
) {
  console.log(`QuestRunner: running  ${questToRun} ...`);
  const id = goblinId;
  try {
    const goblinName = Goblin.getGoblinName(id);
    yield quest.create(id, {id, desktopId});
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
    console.log(`QuestRunner: running  ${questToRun} [DONE]`);
    return res;
  } catch (e) {
    console.log(`QuestRunner: running  ${questToRun} [FAILED]`);
  } finally {
    quest.kill([id]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
