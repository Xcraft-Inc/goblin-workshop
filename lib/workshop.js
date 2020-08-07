//Workshop exports
module.exports = {
  buildWorkitem: require('./workitem-builder.js'),
  editSelectedEntityQuest: require('./editSelectedEntityQuest.js'),
  buildEntity: require('./entity-builder.js'),
  converters: require('xcraft-core-converters'),
  entityMeta: require('./entity-meta.js'),
  MarkdownBuilder: require('./markdown-builder.js'),
  ListHelpers: require('./list-helpers.js'),
  common: require('./workitems/common.js'),
  middlewares: {
    normalizeEntity: require('./middlewares/normalizeEntity.js'),
    migrateCollectionFT2T: require('./middlewares/migrateCollectionFT2T.js'),
    migrateRootEntityFromCollection: require('./middlewares/migrateRootEntityFromCollection.js'),
  },
};
