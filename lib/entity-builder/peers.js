const common = require('../workitems/common.js');

// Build peers entity collections from references and values
const buildPeers = function*(quest, entity) {
  const peers = {};
  const references = entity.meta.references;
  const values = entity.meta.values;
  if (references) {
    for (const path in references) {
      yield* fetchPeers(quest, peers, entity, references, path, false);
    }
  }

  if (values) {
    for (const path in values) {
      fetchValues(quest, peers, entity, values, path, true);
    }
  }

  if (entity.meta.parentEntity && entity.meta.parentEntity !== null) {
    const parent = yield quest.me.getEntity({
      entityId: entity.meta.parentEntity,
    });
    peers.parent = parent;
  }
  return peers;
};

const fetchValues = function(quest, peers, entity, values, path, usePathAsKey) {
  const val = values[path];
  const type = common.getReferenceType(val);
  const peerKey = usePathAsKey ? path : type;
  if (common.referenceUseArity(val)) {
    if (!peers[peerKey]) {
      peers[peerKey] = [];
    }
    for (const rId of entity[path]) {
      const peer = entity.private[path][rId];
      peers[peerKey].push(peer);
    }
  } else {
    //Entity case
    const rId = entity[path];
    if (rId) {
      const peer = entity.private[path][rId];
      peers[peerKey] = peer;
    } else {
      peers[peerKey] = null;
    }
  }
};

const fetchPeers = function*(
  quest,
  peers,
  entity,
  references,
  path,
  usePathAsKey
) {
  const ref = references[path];
  const type = common.getReferenceType(ref);
  const peerKey = usePathAsKey ? path : type;
  if (common.referenceUseArity(ref)) {
    if (!peers[peerKey]) {
      peers[peerKey] = [];
    }
    for (const rId of entity[path]) {
      const peer = yield quest.me.getEntity({entityId: rId});
      peers[peerKey].push(peer);
    }
  } else {
    //Entity case
    const rId = entity[path];
    if (rId) {
      const peer = yield quest.me.getEntity({entityId: rId});
      peers[peerKey] = peer;
    } else {
      peers[peerKey] = null;
    }
  }
};

module.exports = {
  buildPeers,
  fetchValues,
  fetchPeers,
};
