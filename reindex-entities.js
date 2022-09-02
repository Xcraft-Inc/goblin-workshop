const Goblin = require('xcraft-core-goblin');
//usage:
//  quest.evt(reindex-entities-enqueue-requested,{desktopId, data});
exports.xcraftCommands = function () {
  return Goblin.buildQueue('reindex-entities', {
    sub: '*::*.<reindex-entities-enqueue-requested>',
    queueSize: 1,
  });
};
