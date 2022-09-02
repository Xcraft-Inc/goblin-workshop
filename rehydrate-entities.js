const Goblin = require('xcraft-core-goblin');
//usage:
//  quest.evt(rehydrate-entities-enqueue-requested,{desktopId, data});
exports.xcraftCommands = function () {
  return Goblin.buildQueue('rehydrate-entities', {
    sub: '*::*.<rehydrate-entities-enqueue-requested>',
    queueSize: 1,
  });
};
