//const MarkdownBuilder = require ('./markdownBuilder.js');

module.exports = {
  set: (
    entity,
    type,
    references,
    values,
    parentEntity,
    rootAggrId,
    rootAggrPath,
    initialStatus,
    context
  ) => {
    const now = new Date().getTime();
    if (!entity.meta) {
      entity.meta = {};
      entity.meta.version = 0;
      entity.meta.type = type;
      entity.meta.createdAt = now;
      entity.meta.id = entity.id;
      entity.meta.status = initialStatus;
      entity.meta.summaries = {};
      entity.meta.parentEntity = parentEntity;
      entity.meta.rootAggregateId = rootAggrId;
      entity.meta.rootAggregatePath = rootAggrPath;
    }
    const meta = entity.meta;
    meta.references = references || null;
    meta.values = values || null;
    meta.context = context || {};
  },
};
