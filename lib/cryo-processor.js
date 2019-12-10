const watt = require('gigawatts');
const buildMultiLanguageSummaries = require('goblin-nabu-store/lib/summaries.js');
const path = require('path');
const xHost = require('xcraft-core-host');
const fs = require('fs');

class CryoProcessor {
  constructor(goblinName, quest, configurator, dbSrc, dbDst, timestamp, appId) {
    this.batchSize = 1000;
    this.types = require('./entity-builder.js').entities;
    this.entityConfigurations = require('./entity-builder.js').configurations;
    this.goblinName = goblinName;
    this.quest = quest;

    if (!configurator) {
      throw new Error('Missing configurator object');
    }
    this.configurator = configurator;
    this.dbSrc = dbSrc;
    this.dbDst = dbDst;
    this.timestamp = timestamp;
    this.appId = appId;
    this.mandateDst = dbDst.split('.')[0];
    this.desktopId = `desktop@${this.mandateDst}@${this.goblinName}`;
    this.carnotzetId = `carnotzet@${goblinName}`;

    this.quest.goblin.setX('desktopId', this.desktopId);

    this.configuration = {
      rethinkdbHost: this.configurator.rethinkdbHost,
      elasticsearchUrl: this.configurator.elasticsearchUrl,
      mandate: this.mandateDst,
      action: 'reset',
      skipBranch: true,
    };

    const mainGoblin = appId;
    const {projectPath} = xHost;
    this.middlewarePath = path.join(
      projectPath,
      'lib',
      `goblin-${mainGoblin}`,
      'action-stores',
      `${dbDst}.js`
    );

    if (!fs.existsSync(this.middlewarePath)) {
      this.middlewarePath = null;
    }

    watt.wrapAll(this);
  }

  *init() {
    yield this.quest.create(this.carnotzetId, {
      id: this.carnotzetId,
      config: {feed: this.carnotzetId, feeds: []},
      desktopId: this.carnotzetId,
    });
    this.countByType = {};

    if (this.middlewarePath) {
      yield this.quest.cmd('cryo.loadMiddleware', {
        middlewarePath: this.middlewarePath,
      });
    }

    // Get type from goblin Id in db
    // this.types = yield this.quest.cmd(`cryo.getGoblinIds`, {
    //   db: this.dbSrc,
    // });
    // let entitiesType = new Set();
    // this.types.map(goblinId => entitiesType.add(goblinId.split('-')[0]));

    for (const type of this.types) {
      const stats = yield this.quest.cmd(`cryo.frozen`, {
        db: this.dbSrc,
        type,
        timestamp: this.timestamp,
      });

      this.countByType[type] = stats.count;
    }

    const app = this.quest.getAPI(this.appId);
    yield app.bootDatabases({
      configuration: this.configuration,
      desktopId: this.desktopId,
    });
    this.r = this.quest.getStorage('rethink');
    this.e = this.quest.getStorage('elastic');
  }

  /* Save the previous actions store in a new branch */
  *branchIfNeeded() {
    if (this.dbSrc !== this.dbDst) {
      yield this.quest.cmd(`cryo.branch`, {db: this.dbDst});
    }
  }

  *run(next) {
    let unsub = null;
    const mandate = this.mandateDst;
    for (const type of this.types) {
      // If zero entity to thaw, skip entity
      if (!this.countByType[type]) {
        continue;
      }

      const batchSize = this.batchSize;
      // Initialize count for all entity type transformed
      let countByTransformedEntity = {_all: 0, ...this.countByType[type]};
      for (const key in countByTransformedEntity) {
        countByTransformedEntity[key] = 0;
      }

      // Transform all old entities by chunk of batchSize

      let quest = this.quest;
      let entities = {};
      let indexes = {};
      let indexed = {};

      const self = this;
      //SAVE INTO CRYOGENIC CHAMBERS
      unsub = this.quest.sub(`cryo.thawed.${this.dbSrc}`, function*(
        err,
        {msg}
      ) {
        let newType = null;
        try {
          const action = JSON.parse(msg.data.row.action);
          if (action) {
            countByTransformedEntity['_all']++;
            newType = action.payload.state.meta.type;
            let config = self.entityConfigurations[newType];
            countByTransformedEntity[newType]++;
            if (!entities[newType]) {
              entities[newType] = [];
            }
            entities[newType].push(action.payload.state);

            if (config) {
              if (!indexed[newType]) {
                indexed[newType] = !!config.indexer;
              }
            }
          }
          if (indexed[newType]) {
            if (!indexes[newType]) {
              indexes[newType] = [];
            }
            const doc = action.payload.state.meta.index;
            if (doc) {
              const multiLanguageDoc = yield buildMultiLanguageSummaries(
                quest,
                doc,
                true
              );
              const body = Object.entries(multiLanguageDoc).reduce(
                (body, [locale, doc]) => {
                  body.push({
                    index: {
                      _index:
                        locale === '_original'
                          ? mandate
                          : `${mandate}-${locale
                              .toLowerCase()
                              .replace(/\//g, '-')}`,
                      _type: newType,
                      _id: action.payload.state.id,
                    },
                  });
                  if (doc.info) {
                    doc.searchAutocomplete = doc.info;
                    doc.searchPhonetic = doc.info;
                  }
                  body.push(doc);
                  return body;
                },
                []
              );
              indexes[newType] = indexes[newType].concat(body);
            }
          }
        } catch (err) {
          console.error(err);
        } finally {
          self._next();
        }
      });

      let offset = 0;
      while (true) {
        this._next = next.parallel();
        const totalThawed = yield this.quest.cmd(`cryo.thaw`, {
          db: this.dbSrc,
          timestamp: this.timestamp,
          type,
          length: batchSize,
          offset,
        });

        if (!totalThawed) {
          this._next();
          break; //EXIT WHILE LOOP
        }
        yield next.sync();

        for (const entityName in entities) {
          yield this.r.set({
            table: entityName,
            documents: entities[entityName],
          });
          if (indexed[entityName] && indexes[entityName].length > 0) {
            yield this.e.bulk({body: indexes[entityName]});
          }
        }
        offset += batchSize;
        entities = {};
        indexes = {};
        indexed = {};
      }
    }
    unsub();
  }

  *restore() {
    /* Copy the src actions store as destination store */
    yield this.quest.cmd(`cryo.restore`, {
      dbSrc: this.dbSrc,
      dbDst: this.dbDst,
      timestamp: this.timestamp,
    });
  }

  dispose() {
    this.quest.release(this.carnotzetId);
  }
}

module.exports = CryoProcessor;
