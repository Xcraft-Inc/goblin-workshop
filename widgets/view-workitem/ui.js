import T from 't';
import React from 'react';

import Container from 'goblin-gadgets/widgets/container/widget';
import Field from 'goblin-gadgets/widgets/field/widget';
import Label from 'goblin-gadgets/widgets/label/widget';
/******************************************************************************/

function renderPanel(props) {
  return (
    <Container kind="column" grow="1">
      <Container kind="pane">
        <Label kind="title" text={T('Colonnes')} />
        <Field
          kind="ids"
          horizontalSeparator="compact"
          plugin="column"
          model=".columns"
        />
      </Container>
    </Container>
  );
}

/******************************************************************************/

export default {
  panel: {
    readonly: renderPanel,
    edit: renderPanel,
  },
};
