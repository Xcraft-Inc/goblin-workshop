import React from 'react';
import Widget from 'laboratory/widget';
import {fromJS} from 'immutable';
import Shredder from 'xcraft-core-shredder';

import Tree from 'gadgets/tree/widget';

class Ripley extends Widget {
  constructor() {
    super(...arguments);
    this.select = this.select.bind(this);
  }

  static get wiring() {
    return {
      id: 'id',
      db: 'db',
      selected: 'selected',
    };
  }

  select(selectedId) {
    this.do('select', {selectedId});
  }

  render() {
    if (!this.props.id) {
      return null;
    }

    let table = new Shredder({
      header: [
        {
          name: 'database',
          description: 'Actions store',
          grow: '1',
          textAlign: 'left',
        },
      ],
      rows: [],
    });

    const rows = [];

    for (const [db, branches] of this.props.db.entries()) {
      rows.push({id: db, database: db});
    }

    table = table.set('rows', fromJS(rows));

    return (
      <Tree
        data={table}
        grow="1"
        frame="true"
        hasButtons="true"
        selection="true"
        selectedIds={this.props.selected}
        selectionChanged={selectedId => {
          this.select(selectedId);
          if (this.props.onSelect) {
            this.props.onSelect(selectedId);
          }
        }}
      />
    );
  }
}

export default Ripley;
