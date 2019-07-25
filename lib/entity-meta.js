//const MarkdownBuilder = require ('./markdown-builder.js');

module.exports = {
  set: (
    entity,
    type,
    references,
    values,
    links,
    parentEntity,
    rootAggrId,
    rootAggrPath,
    initialStatus,
    context
  ) => {
    const now = new Date().getTime();
    if (!entity.get('meta')) {
      entity = entity.set('meta', {
        id: entity.get('id'),
        version: 0,
        type: type,
        createdAt: now,
        status: initialStatus,
        summaries: {},
        parentEntity: parentEntity,
        rootAggregateId: rootAggrId,
        rootAggregatePath: rootAggrPath,
      });
    }

    entity = entity.set('meta.references', references || null);
    entity = entity.set('meta.values', values || null);
    entity = entity.set('meta.links', links || null);
    entity = entity.set('meta.context', context || null);
    return entity;
  },
};
