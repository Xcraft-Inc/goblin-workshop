'use strict';
//T:2019-02-27

const Goblin = require('xcraft-core-goblin');
const {OrderedMap, fromJS} = require('immutable');
module.exports = {
  'create': Goblin.Shredder.mutableReducer((state, action) => {
    return state
      .set('id', action.get('id'))
      .set('status', action.get('status'))
      .set('columns', action.get('columns'))
      .set('count', action.get('count'))
      .set('options', action.get('options'))
      .set('highlights', {})
      .set('score', 0);
  }),

  'set-sort': (state, action) => {
    return state.set('options.sort', {
      key: action.get('key'),
      dir: action.get('dir'),
    });
  },

  'set-highlights': (state, action) => {
    state = state.set('highlights', action.get('highlights'));
    return state;
  },

  'set-facets': Goblin.Shredder.mutableReducer((state, action) => {
    const facets = action.get('facets');

    let initialSet = true;
    if (!facets.filters) {
      facets.filters = Object.values(state.get('options.filters').toJS());
      initialSet = false;
    }

    for (const filter of facets.filters) {
      if (initialSet) {
        state = state
          .set(`facetsDisplayName.${filter.name}`, filter.displayName)
          .set(`facetsMappingType.${filter.name}`, filter.mappingType)
          .set(`options.filters.${filter.name}`, filter);
      }

      const facet = facets.buckets[filter.name];
      switch (filter.mappingType) {
        default:
        case 'keyword':
          state = state
            .set(
              `facets.${filter.name}`,
              facet.map((f) => {
                return {
                  key: f.key_as_string || f.key,
                  doc_count: f.doc_count,
                };
              })
            )
            .set(
              `checkboxes.${filter.name}`,
              facet.reduce((state, term) => {
                const key = term.key_as_string || term.key;
                state = state.set(
                  key,
                  fromJS({
                    count: term.doc_count,
                    checked: filter.value.indexOf(key) === -1,
                  })
                );
                return state;
              }, new OrderedMap({}))
            );

          break;
        case 'date':
          {
            state = state
              .set(
                `facets.${filter.name}`,
                facet.agg.map((f) => {
                  return {
                    key: f.key_as_string || f.key,
                    doc_count: f.doc_count,
                  };
                })
              )
              .set(`ranges.${filter.name}.min`, facet.min)
              .set(`ranges.${filter.name}.max`, facet.max);

            const mode = state.get(`ranges.${filter.name}.mode`, 'unknow');
            if (mode === 'all') {
              const from = state.get(`ranges.${filter.name}.from`);
              const to = state.get(`ranges.${filter.name}.to`);
              if (facet.min < from) {
                state = state.set(`ranges.${filter.name}.from`, facet.min);
              }
              if (facet.max > to) {
                state = state.set(`ranges.${filter.name}.to`, facet.max);
              }
            }
          }
          break;
      }
    }
    return state;
  }),

  'set-count': (state, action) => {
    if (action.get('initial') === true) {
      state = state.set('initialCount', action.get('count'));
    }
    return state.set('count', action.get('count'));
  },

  'set-initial-count': (state, action) => {
    return state.set('initialCount', action.get('count'));
  },

  'change-options': (state, action) => {
    return state
      .set('options', action.get('options'))
      .set('count', action.get('count'));
  },

  'init-all-facets': Goblin.Shredder.mutableReducer((state, action) => {
    const filterName = action.get('filterName');
    const keys = action.get('keys');
    const facet = state.get(`facets.${filterName}`);
    const filteredKeys = [];
    state = state.set(
      `checkboxes.${filterName}`,
      facet.reduce((state, term) => {
        const key = term.get('key');
        const checked = keys.includes(key);
        if (!checked) {
          filteredKeys.push(key);
        }
        state = state.set(key, fromJS({count: term.get('doc_count'), checked}));
        return state;
      }, new OrderedMap({}))
    );
    state = state.set(`options.filters.${filterName}.value`, filteredKeys);
    return state;
  }),

  'toggle-all-facets': Goblin.Shredder.mutableReducer((state, action) => {
    const filterName = action.get('filterName');
    const keys = action.get('keys');
    const facet = state.get(`facets.${filterName}`);
    const checkboxes = state.get(`checkboxes.${filterName}`);
    const filteredKeys = [];
    state = state.set(
      `checkboxes.${filterName}`,
      facet.reduce((state, term) => {
        const key = term.get('key');
        const checked =
          !keys || keys.includes(key)
            ? !checkboxes.get(`${key}.checked`, false)
            : checkboxes.get(`${key}.checked`, false);
        if (!checked) {
          filteredKeys.push(key);
        }
        state = state.set(key, fromJS({count: term.get('doc_count'), checked}));
        return state;
      }, new OrderedMap({}))
    );
    state = state.set(`options.filters.${filterName}.value`, filteredKeys);
    return state;
  }),

  'set-all-facets': Goblin.Shredder.mutableReducer((state, action) => {
    const filterName = action.get('filterName');
    const keys = action.get('keys');
    const facet = state.get(`facets.${filterName}`);
    const checkboxes = state.get(`checkboxes.${filterName}`);
    const filteredKeys = [];
    state = state.set(
      `checkboxes.${filterName}`,
      facet.reduce((state, term) => {
        const key = term.get('key');
        const checked =
          !keys || keys.includes(key)
            ? true
            : checkboxes.get(`${key}.checked`, false);
        if (!checked) {
          filteredKeys.push(key);
        }
        state = state.set(key, fromJS({count: term.get('doc_count'), checked}));
        return state;
      }, new OrderedMap({}))
    );
    state = state.set(`options.filters.${filterName}.value`, filteredKeys);
    return state;
  }),

  'clear-all-facets': Goblin.Shredder.mutableReducer((state, action) => {
    const filterName = action.get('filterName');
    const keys = action.get('keys');
    const facet = state.get(`facets.${filterName}`);
    const checkboxes = state.get(`checkboxes.${filterName}`);
    const filteredKeys = [];
    state = state.set(
      `checkboxes.${filterName}`,
      facet.reduce((state, term) => {
        const key = term.get('key');
        const checked =
          !keys || keys.includes(key)
            ? false
            : checkboxes.get(`${key}.checked`, false);
        if (!checked) {
          filteredKeys.push(key);
        }
        state = state.set(key, fromJS({count: term.get('doc_count'), checked}));
        return state;
      }, new OrderedMap({}))
    );
    state = state.set(`options.filters.${filterName}.value`, filteredKeys);
    return state;
  }),

  'toggle-facet-filter': Goblin.Shredder.mutableReducer((state, action) => {
    const filterName = action.get('filterName');
    const facetName = action.get('facet');
    const checkboxes = state.get(`checkboxes.${filterName}`);
    const checkbox = checkboxes._state.get(facetName);
    const newCheckedState = !checkbox.get('checked');
    state = state.set(
      `checkboxes.${filterName}`,
      checkboxes._state.set(
        facetName,
        fromJS({
          count: checkbox.get('count'),
          checked: newCheckedState,
        })
      )
    );

    const newValue = state
      .get(`options.filters.${filterName}.value`)
      .valueSeq()
      .toArray();
    if (newCheckedState === true) {
      const facetIndex = newValue.indexOf(facetName);
      newValue.splice(facetIndex, 1);
      state = state.set(`options.filters.${filterName}.value`, newValue);
    } else {
      newValue.push(facetName);
      state = state.set(`options.filters.${filterName}.value`, newValue);
    }

    return state;
  }),

  'set-range': Goblin.Shredder.mutableReducer((state, action) => {
    const filterName = action.get('filterName');
    const from = action.get('from');
    const to = action.get('to');

    const mode = action.get('mode', 'unknow');
    state = state
      .set(`ranges.${filterName}.from`, from)
      .set(`ranges.${filterName}.to`, to)
      .set(`ranges.${filterName}.useRange`, true)
      .set(`ranges.${filterName}.mode`, mode);
    state = state.set(`options.filters.${filterName}.value`, {from, to});
    return state;
  }),

  'clear-range': Goblin.Shredder.mutableReducer((state, action) => {
    const filterName = action.get('filterName');
    state = state.set(`ranges.${filterName}.useRange`, false);
    state = state.set(`options.filters.${filterName}.value`, []);
    return state;
  }),

  'customize-visualization': Goblin.Shredder.mutableReducer((state, action) => {
    const sort = action.get('sort');
    const filter = action.get('filter');
    if (sort) {
      state = state.set('options.sort', sort);
    }
    if (filter) {
      const facet = state.get(`facets.${filter.name}`);
      state = state.set(`options.filters.${filter.name}`, filter).set(
        `checkboxes.${filter.name}`,
        facet.reduce((state, term) => {
          state = state.set(
            term.get('key'),
            fromJS({
              count: term.get('doc_count'),
              checked: filter.value.indexOf(term.get('key')) === -1,
            })
          );
          return state;
        }, new OrderedMap({}))
      );
    }
    return state;
  }),

  'change-content-index': Goblin.Shredder.mutableReducer((state, action) => {
    let value = action.get('value');
    if (!Array.isArray(value)) {
      value = [value];
    }
    return state
      .set('options.contentIndex.name', action.get('name'))
      .set('options.contentIndex.value', value)
      .set('list', {})
      .set('count', action.get('count'));
  }),

  'refresh': Goblin.Shredder.mutableReducer((state, action) => {
    const ids = action.get('ids');

    const highlights = action.get('highlights');
    if (highlights) {
      state = state.set('highlights', highlights);
    }
    const score = action.get('score');
    if (score) {
      state = state.set('score', score);
    }
    const offset = action.get('offset');
    const items = ids.reduce((list, id, index) => {
      list[`${offset + index}-item`] = id;
      return list;
    }, {});

    state = state.set(`list`, items);
    state = state.set('count', action.get('count'));

    return state;
  }),

  'handle-changes': (state) => {
    return state.set('count', 0).set('list', {});
  },

  'remove': (state) => {
    const newCount = Number(state.get('count')) - 1;
    return state.set('count', newCount).set('list', {});
  },

  'add': (state) => {
    const newCount = Number(state.get('count')) + 1;
    return state.set('count', newCount).set('list', {});
  },
};
