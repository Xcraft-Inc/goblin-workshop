const common = require('../workitems/common.js');
const watt = require('watt');
const Goblin = require('xcraft-core-goblin');

// Build peers entity collections from references and values
const buildPeers = watt(function*(quest, entity) {
  const peers = {};
  const references = entity.get('meta.references', null);
  const values = entity.get('meta.values', null);
  if (references) {
    for (const path of references.keys()) {
      yield fetchPeers(quest, peers, entity, references, path, true);
    }
  }

  if (values) {
    for (const path of values.keys()) {
      fetchValues(quest, peers, entity, values, path, true);
    }
  }
  const parentId = entity.get('meta.parentEntity', null);
  if (parentId) {
    const parent = yield quest.me.getEntity({
      entityId: parentId,
    });
    peers.parent = parent;
  }
  return peers;
});

const fetchValues = function(quest, peers, entity, values, path, usePathAsKey) {
  const val = values.get(path);
  const type = common.getReferenceType(val);
  const peerKey = usePathAsKey ? path : type;
  if (common.referenceUseArity(val)) {
    if (!peers[peerKey]) {
      peers[peerKey] = [];
    }
    entity.get(path).forEach(rId => {
      const peer = entity.get(`private.${path}.${rId}`);
      peers[peerKey].push(peer);
    });
  } else {
    //Entity case
    const rId = entity.get(path);
    if (rId) {
      const peer = entity.get(`private.${path}.${rId}`);
      peers[peerKey] = peer;
    } else {
      peers[peerKey] = null;
    }
  }
};

const fetchPeers = watt(function*(
  quest,
  peers,
  entity,
  references,
  path,
  usePathAsKey,
  next
) {
  const ref = references.get(path);
  const type = common.getReferenceType(ref);
  const peerKey = usePathAsKey ? path : type;
  if (common.referenceUseArity(ref)) {
    if (!peers[peerKey]) {
      peers[peerKey] = [];
    }
    entity.get(path).forEach(rId => {
      quest.me.getEntity({entityId: rId}, next.parallel());
    });
    const entities = yield next.sync();
    if (entities) {
      peers[peerKey] = entities.map(e => new Goblin.Shredder(e));
    }
  } else {
    //Entity case
    const rId = entity.get(path);
    if (rId) {
      const peer = yield quest.me.getEntity({entityId: rId});
      peers[peerKey] = new Goblin.Shredder(peer);
    } else {
      peers[peerKey] = null;
    }
  }
});

module.exports = {
  buildPeers,
  fetchValues,
  fetchPeers,
};
