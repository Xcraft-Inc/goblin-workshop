const common = require('../workitems/common.js');
const watt = require('gigawatts');
const Goblin = require('xcraft-core-goblin');

// Build peers entity collections from references and values
const buildPeers = watt(function*(quest, entity, skipped, next) {
  const peers = {};
  const references = entity.get('meta.references', null);
  const values = entity.get('meta.values', null);

  if (values) {
    for (const path of values.keys()) {
      if (skipped.includes(path)) {
        continue;
      }
      fetchValues(quest, peers, entity, values, path, true);
    }
  }

  if (references) {
    for (const path of references.keys()) {
      if (skipped.includes(path)) {
        continue;
      }
      fetchPeers(quest, peers, entity, references, path, true, next.parallel());
    }
  }

  const parentId = entity.get('meta.parentEntity', null);
  if (parentId) {
    quest.me.getEntity(
      {
        entityId: parentId,
        privateState: true,
      },
      next.parallel()
    );
  }

  const results = yield next.sync();
  if (parentId) {
    //take the only returned value (the parent)
    peers.parent = results.filter(r => !!r)[0];
  }

  return peers;
});

const fetchValues = function(quest, peers, entity, values, path, usePathAsKey) {
  const val = values.get(path);
  const type = common.getReferenceType(val);
  const peerKey = usePathAsKey ? path : type;
  if (common.referenceUseArity(val)) {
    peers[peerKey] = [];
    const valuesAtPath = entity.get(`private.${path}`);
    const valuesOrder = entity.get(path);
    if (valuesAtPath) {
      valuesAtPath.valueSeq().reduce((peers, p) => {
        p = new Goblin.Shredder(p);
        const pIndex = valuesOrder.indexOf(p.get('id'));
        if (pIndex === -1) {
          //Detected bad entity cache
          /*console.warn(`Detected bad entity cache in ${entity.get(
            'id'
          )} at ${path},
          ${p.get('id')} still present`);*/
          return peers;
        }
        peers.splice(pIndex, 0, p);
        return peers;
      }, peers[peerKey]);
    }
  } else {
    peers[peerKey] = null;
    //Entity case
    const rId = entity.get(path);
    if (rId) {
      const peer = entity.get(`private.${path}.${rId}`);
      peers[peerKey] = peer;
    }
  }
};

const fetchPeers = watt(function*(
  quest,
  peers,
  entity,
  references,
  path,
  usePathAsKey
) {
  const ref = references.get(path);
  const type = common.getReferenceType(ref);
  const peerKey = usePathAsKey ? path : type;

  if (common.referenceUseArity(ref)) {
    peers[peerKey] = [];

    const entityIds = entity.get(path).toArray();
    if (entityIds.length > 0) {
      const entities = yield quest.me.getEntities({type, entityIds});
      peers[peerKey] = entities;
    }
  } else {
    peers[peerKey] = null;

    //Entity case
    const rId = entity.get(path);
    if (rId) {
      peers[peerKey] = yield quest.me.getEntity({
        entityId: rId,
        privateState: true,
      });
    }
  }
});

module.exports = {
  buildPeers,
  fetchValues,
  fetchPeers,
};
