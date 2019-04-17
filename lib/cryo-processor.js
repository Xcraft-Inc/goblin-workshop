const watt = require('gigawatts');
const buildMultiLanguageSummaries = require('goblin-nabu/lib/summaries.js');

class CryoProcessor {
  constructor(goblinName, quest, configurator, dbSrc, dbDst, timestamp) {
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

    this.mandateDst = dbDst.split('.')[0];
    this.desktopId = `desktop@${this.mandateDst}@${this.goblinName}`;
    this.carnotzetId = `carnotzet@${goblinName}`;

    this.quest.goblin.setX('desktopId', this.desktopId);

    this.configuration = {
      rethinkdbHost: this.configurator.rethinkdbHost,
      elasticsearchUrl: this.configurator.elasticsearchUrl,
      mandate: this.mandateDst,
      reset: true,
      skipBranch: true,
    };

    watt.wrapAll(this);
  }

  *init() {
    yield this.quest.create(this.carnotzetId, {
      id: this.carnotzetId,
      config: {feed: this.carnotzetId, feeds: []},
      _goblinFeed: {[this.carnotzetId]: true},
    });
    this.countByType = {};
    for (const type of this.types) {
      const stats = yield this.quest.cmd(`cryo.frozen`, {
        db: this.dbSrc,
        type,
        timestamp: this.timestamp,
      });

      this.countByType[type] = stats.count;
    }

    const poly = this.quest.getAPI('polypheme');
    yield poly.bootDatabases({
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
      let offset = 0;
      if (!this.countByType[type]) {
        continue;
      }
      const indexed = !!this.entityConfigurations[type].indexer;
      const total = this.countByType[type];
      const batchSize = this.batchSize;

      while (offset < total) {
        let quest = this.quest;
        let _next = next.parallel();
        let entry = 0;
        let entities = [];
        let indexes = [];
        unsub = this.quest.sub(`cryo.thawed.${this.dbSrc}`, function*(
          err,
          {msg}
        ) {
          try {
            const action = JSON.parse(msg.data.action);
            entities.push(action.payload.state);
            if (indexed) {
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
                        _type: type,
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
                indexes = indexes.concat(body);
              }
            }
          } catch (err) {
            console.error(err);
          } finally {
            ++entry;
            console.log(`${type}: ${offset + entry}/${total}`);
            const finished = offset + entry === total;
            if (entry === batchSize || finished) {
              _next();
            }
          }
        });
        yield this.quest.cmd(`cryo.thaw`, {
          db: this.dbSrc,
          timestamp: this.timestamp,
          type,
          length: batchSize,
          offset,
        });
        yield next.sync();
        unsub();
        offset += batchSize;
        yield this.r.set({
          table: type,
          documents: entities,
        });
        if (indexed && indexes.length > 0) {
          yield this.e.bulk({body: indexes});
        }
      }
    }

    /*const documentsByTypes = {};
    this.quest.defer();

    const index = quest.getSession();
    const configurations = require('./entity-builder.js').configurations;
    const body = Object.entries(documentsByTypes).reduce(
      (body, [type, documents]) => {
        if (configurations[type].indexer) {
          documents.forEach(doc => {
            if (doc.meta.index) {
              body.push({index: {_index: index, _type: type, _id: doc.id}});
              const document = {...doc.meta.index};
              if (document.info) {
                document.searchAutocomplete = document.info;
                document.searchPhonetic = document.info;
              }
              body.push(document);
            } else {
              console.warn(`${doc.id} never indexed but in action store...`);
            }
          });
        }
        return body;
      },
      []
    );
    yield e.bulk({body});

    const missingDocByTypes = {};

    for (const type of Object.keys(documentsByTypes)) {
      yield quest.me.maintenance({
        status: 'hard',
        message: `Inserting ${
          Object.keys(documentsByTypes[type]).length
        } ${type}(s)`,
      });
      yield r.set({
        table: type,
        documents: documentsByTypes[type],
      });
    }*/
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
