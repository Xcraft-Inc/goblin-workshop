const watt = require('gigawatts');
const indexBuilder = require('./indexer/indexBuilder.js');
const path = require('path');
const xHost = require('xcraft-core-host');
const fs = require('fs');

class CryoProcessor {
  constructor(goblinName, quest, configurator, dbSrc, dbDst, timestamp, appId) {
    this.batchSize = 1000;
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
    this.mandateDst = dbDst.split('.', 1)[0];
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

    const typeCount = yield this.quest.cmd(`cryo.getEntityTypeCount`, {
      db: this.dbSrc,
    });

    this.types = [];
    for (const item of typeCount) {
      const type = item.type;
      this.types.push(type);
      this.countByType[type] = item.count;
    }

    const app = this.quest.getAPI(this.appId);

    const entityBuilderConfig = require('goblin-workshop').buildEntity;
    yield app.bootDatabases({
      configuration: this.configuration,
      desktopId: this.desktopId,
      ...entityBuilderConfig,
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
      let thawed = 0;
      unsub = this.quest.sub(`cryo.thawed.${this.dbSrc}`, function* (
        err,
        {msg}
      ) {
        let newType = null;
        try {
          const actions = msg.data.map((row) => JSON.parse(row.action));
          for (const action of actions) {
            countByTransformedEntity['_all']++;
            newType = action.payload.state.meta.type;
            let config = self.entityConfigurations[newType];
            countByTransformedEntity[newType]++;
            if (!entities[newType]) {
              entities[newType] = [];
            }
            const entity = action.payload.state;
            entities[newType].push(entity);

            if (config) {
              if (!indexed[newType]) {
                indexed[newType] = !!config.indexer;
              }
            }
            if (indexed[newType]) {
              if (!indexes[newType]) {
                indexes[newType] = [];
              }

              const body = yield indexBuilder(
                quest,
                mandate,
                newType,
                action.payload.state.id,
                entity,
                config
              );

              if (body) {
                indexes[newType] = indexes[newType].concat(body);
              }
            }
          }
        } catch (err) {
          console.error(err);
        } finally {
          thawed++;
          if (thawed === self.countByType[type]) {
            self._nexts[type]();
          }
        }
      });

      let offset = 0;
      this._nexts = {};
      while (offset < this.countByType[type]) {
        this._nexts[type] = next.parallel();
        const count = yield this.quest.cmd(`cryo.thaw`, {
          db: this.dbSrc,
          timestamp: this.timestamp,
          type,
          length: batchSize,
          offset,
        });

        if (count === 0) {
          this._nexts[type]();
          yield next.sync();
          break;
        } else {
          yield next.sync();
        }

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
