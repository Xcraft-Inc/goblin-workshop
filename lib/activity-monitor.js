'use strict';

const goblinName = 'activity-monitor';
const Goblin = require('xcraft-core-goblin');
const watt = require('gigawatts');

/******************************************************************************/

// Define initial logic values
const logicState = {
  id: goblinName,
  channels: {
    test: {
      samples: [1, 2, 3],
    },
  },
};

const logicHandlers = {
  tick: Goblin.Shredder.mutableReducer(state => {
    for (const [channelName, data] of state.get('channels').entries()) {
      let samples = data.get('samples');
      samples = samples.shift().push(samples.last());
      state = state.set(`channels.${channelName}.samples`, samples);
    }
    return state;
  }),
};

/******************************************************************************/

const tick = watt(function*(resp) {
  console.log('COUCOU');
  yield resp.command.send('activity-monitor.tick');
});

/******************************************************************************/

Goblin.registerQuest(goblinName, 'init', function(quest, $msg) {
  console.log(
    '\x1b[32m%s\x1b[0m',
    'Goblin-Workshop: Activity Monitor [RUNNING]'
  );

  const busClient = require('xcraft-core-busclient').getGlobal();
  const orcName = $msg.orcName;
  const resp = busClient.newResponse('activity-monitor', orcName);

  setInterval(() => tick(resp), 1000);
});

Goblin.registerQuest(goblinName, 'tick', function*(quest) {
  yield quest.doSync();
});

/******************************************************************************/

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
