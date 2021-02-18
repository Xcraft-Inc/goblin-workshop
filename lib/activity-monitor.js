'use strict';

const goblinName = 'activity-monitor';
const Goblin = require('xcraft-core-goblin');
const watt = require('gigawatts');
/******************************************************************************/

function getRange(samples) {
  let min = 0;
  let max = 0;
  for (const sample of samples) {
    min = Math.min(min, sample);
    max = Math.max(max, sample);
  }
  return {min, max};
}

function delayedProgress(
  delayedValue,
  value,
  increaseFactor = 0.4,
  decreaseFactor = 0.1,
  chouia = 0.1
) {
  if (delayedValue > value) {
    delayedValue -= (delayedValue - value) * decreaseFactor;
  } else {
    delayedValue -= (delayedValue - value) * increaseFactor;
  }

  if (Math.abs(delayedValue - value) < chouia) {
    delayedValue = value;
  }

  return delayedValue;
}

/******************************************************************************/

// Define initial logic values.
const logicState = {
  id: goblinName,
  channels: {},
  private: {
    isActive: false,
    channels: {
      //- test1: {
      //-   samples: [1, 2, 3],
      //-   isActive: true,
      //-   max: 3,
      //- },
      //- test2: {
      //-   samples: [4, 5, 6, 7, 6, 5, 4],
      //-   isActive: true,
      //-   max: 7,
      //- },
      //- test3: {
      //-   samples: [0, 0, 0, 0],
      //-   isActive: false,
      //-   max: 0,
      //- },
    },
  },
};

const logicHandlers = {
  init: (state) => state,
  disposeChannel: (state, action) => {
    return state
      .del(`private.channels.${action.get('channel')}`)
      .del(`channels.${action.get('channel')}`);
  },
  tick: Goblin.Shredder.mutableReducer((state) => {
    let isActive = false;
    let max = 0;
    for (const [channelName, data] of state.get('private.channels').entries()) {
      let samples = data.get('samples');
      const a = samples.last() > 0;
      const r = getRange(samples);
      state = state.set(`channels.${channelName}.samples`, samples);
      state = state.set(`channels.${channelName}.isActive`, a);
      state = state.set(`channels.${channelName}.max`, r.max);

      let delayedMax = state.get(`channels.${channelName}.delayedMax`, r.max);
      delayedMax = delayedProgress(delayedMax, r.max);
      state = state.set(`channels.${channelName}.delayedMax`, delayedMax);

      isActive = a ? true : isActive;
      max = Math.max(max, r.max);

      samples = samples.shift().push(0);
      state = state.set(`private.channels.${channelName}.samples`, samples);
    }
    state = state.set(`private.isActive`, isActive);
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

Goblin.registerQuest(goblinName, 'init', function* (quest) {
  console.log(
    '\x1b[32m%s\x1b[0m',
    'Goblin-Workshop: Activity Monitor [RUNNING]'
  );
  quest.do();
  quest.sub.local(`*::<job-queue.disposed>`, function* (err, {msg, resp}) {
    yield resp.cmd('activity-monitor.disposeChannel', {...msg.data});
  });

  const unsub = quest.sub.local(`*::<job-queue.sampled>`, function* (
    err,
    {msg, resp}
  ) {
    yield resp.cmd('activity-monitor.sample', {...msg.data});
  });
  yield quest.me.tick();
  quest.goblin.setX('unsub', unsub);
});

Goblin.registerQuest(goblinName, 'tick', function (quest) {
  let wasOn;

  const dispatchTick = watt(function* () {
    yield quest.doSync();
    const on = quest.goblin.getState().get('private.isActive');
    if (on !== wasOn) {
      yield quest.cmd('activity-monitor-led.active', {on});
      wasOn = on;
    }
  });

  setInterval(dispatchTick, 1000);
});

Goblin.registerQuest(goblinName, 'sample', function (
  quest,
  channel,
  sample,
  current,
  total
) {
  quest.do({channel, sample, current, total});
});

Goblin.registerQuest(goblinName, 'disposeChannel', function (quest, channel) {
  quest.do({channel});
});

Goblin.registerQuest(goblinName, 'unsubscribe', function (quest) {
  const unsub = quest.goblin.getX('unsub');
  unsub();
});

/******************************************************************************/

const getMetrics = function (goblin) {
  const metrics = {};
  const state = goblin.getState();
  const channels = state.get('channels');
  for (const [name, data] of channels.entries()) {
    metrics[name] = data.get('samples').first();
  }
  return metrics;
};

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  getMetrics,
});
Goblin.createSingle(goblinName);
