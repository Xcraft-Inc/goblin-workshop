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
  quest.goblin.defer(
    quest.sub('*::*.run-quest-requested', (err, msg) => {
      msg.data.$orcName = msg.orcName;
      quest.me.run({...msg.data});
    })
  );
});

Goblin.registerQuest(goblinName, 'run', function*(
  quest,
  runId,
  goblinId,
  questToRun,
  createParams,
  $msg
) {
  console.log(`QuestRunner: running  ${questToRun} ...`);
  const id = goblinId;
  const goblinName = Goblin.getGoblinName(id);
  createParams.id = id;
  yield quest.create(id, createParams);
  const data = yield quest.cmd(
    `${goblinName}._$${questToRun}`,
    Object.assign(
      {id},
      Object.keys($msg.data.data)
        .filter(k => k.startsWith('$param-'))
        .reduce((payload, key) => {
          payload[key.replace('$param-', '')] = $msg.data.data[key];
          return payload;
        }, {})
    )
  );
  console.log(`QuestRunner: running  ${questToRun} [DONE]`);
  quest.evt(`${runId}.done`, {data});
  quest.kill([id]);
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
