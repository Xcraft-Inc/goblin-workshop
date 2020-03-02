'use strict';

const goblinName = 'activity-monitor';
const Goblin = require('xcraft-core-goblin');
const watt = require('gigawatts');
const busClient = require('xcraft-core-busclient').getGlobal();
const resp = busClient.newResponse('activity-monitor', 'token');

/******************************************************************************/

// Define initial logic values.
const logicState = {
  id: goblinName,
  channels: {},
  private: {
    channels: {},
  },
};

const logicHandlers = {
  tick: Goblin.Shredder.mutableReducer(state => {
    for (const [channelName, data] of state.get('private.channels').entries()) {
      let samples = data.get('samples');
      state = state.set(`channels.${channelName}.samples`, samples);
      state = state.set(`channels.${channelName}.isActive`, samples.last() > 0);

      samples = samples.shift().push(0);
      state = state.set(`private.channels.${channelName}.samples`, samples);
    }
    return state;
  }),

  sample: Goblin.Shredder.mutableReducer((state, action) => {
    const channel = action.get('channel');
    const sample = action.get('sample');
    const current = action.get('current');
    const total = action.get('total');

    if (!state.get(`private.channels.${channel}`, null)) {
      const samples = [];
      samples.length = 100;
      samples.fill(0);

      state = state.set(`private.channels.${channel}`, {
        samples: samples,
        current: 0,
        total: 0,
      });
    }

    const samples = state.get(`private.channels.${channel}.samples`);
    const newSamples = samples.set(
      samples.size - 1,
      samples.state.last() + sample
    );
    state = state.set(`private.channels.${channel}.samples`, newSamples);
    state = state.set(`private.channels.${channel}.current`, current);
    state = state.set(`private.channels.${channel}.total`, total);

    return state;
  }),
};

/******************************************************************************/

const tick = watt(function*(next) {
  yield resp.command.send('activity-monitor.tick', {}, next);
});

/******************************************************************************/

Goblin.registerQuest(goblinName, 'init', function(quest) {
  console.log(
    '\x1b[32m%s\x1b[0m',
    'Goblin-Workshop: Activity Monitor [RUNNING]'
  );

  setInterval(tick, 1000);

  const unsub = quest.sub(`*::*.sampled`, function*(err, {msg, resp}) {
    yield resp.cmd('activity-monitor.sample', {...msg});
  });
  quest.goblin.setX('unsub', unsub);
});

Goblin.registerQuest(goblinName, 'tick', function(quest) {
  quest.do();
});

Goblin.registerQuest(goblinName, 'sample', function(
  quest,
  channel,
  sample,
  current,
  total
) {
  quest.do({channel, sample, current, total});
});

Goblin.registerQuest(goblinName, 'unsubscribe', function(quest) {
  const unsub = quest.goblin.getX('unsub');
  unsub();
});

/******************************************************************************/

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
