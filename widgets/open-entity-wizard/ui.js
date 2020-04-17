//T:2019-02-27
import React from 'react';
import T from 't';
import Container from 'goblin-gadgets/widgets/container/widget';
import Label from 'goblin-gadgets/widgets/label/widget';
import Separator from 'goblin-gadgets/widgets/separator/widget';
import Field from 'goblin-gadgets/widgets/field/widget';

function options(props) {
  return (
    <Container kind="column" grow="1">
      <Container kind="row" grow="1">
        <Field model=".form.entityId" />
      </Container>
    </Container>
  );
}

/******************************************************************************/

export default {
  options,
};
