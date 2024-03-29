//Workshop exports
module.exports = {
  buildWorkitem: require('./workitem-builder.js'),
  editSelectedEntityQuest: require('./editSelectedEntityQuest.js'),
  buildEntity: require('./entity-builder.js'),
  entityMeta: require('./entity-meta.js'),
  MarkdownBuilder: require('./markdown-builder.js'),
  ListHelpers: require('./list-helpers.js'),
  common: require('./workitems/common.js'),
  middlewares: {
    normalizeEntity: require('./middlewares/normalizeEntity.js'),
    migrateCollectionFT2T: require('./middlewares/migrateCollectionFT2T.js'),
    migrateRootEntityFromCollection: require('./middlewares/migrateRootEntityFromCollection.js'),
  },
  buildSchemas: require('./schemas-builder.js'),
  prepareEntityForSchema: require('./prepareEntityForSchema.js'),
  SmartId: require('./smartId.js'),
  AggregateBuilder: require('./aggregateBuilder.js'),
  AlertsBuilder: require('./alertsBuilder.js'),
  CSVOutput: require('./FileOutput.js').CSVOutput,
  JSONOutput: require('./FileOutput.js').JSONOutput,
};
