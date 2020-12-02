const Goblin = require('xcraft-core-goblin');

/**
 * Retrieve the list of available commands.
 *
 * @returns {Object} The list and definitions of commands.
 */
exports.xcraftCommands = function () {
  return Goblin.buildQueueWorker('graph-loader-queue', {
    workQuest: function* (quest, desktopId, workitemId, forDesktopId, recycle) {
      try {
        const api = yield quest.create(workitemId, {
          id: workitemId,
          desktopId,
          throwIfNewInstance: true,
        });
        yield api.loadGraph({desktopId: forDesktopId, recycle});
      } catch {
        quest.log.dbg(`SKIPPED graph loading of ${workitemId}`);
      }
    },
  });
};
