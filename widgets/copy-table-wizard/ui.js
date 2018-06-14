import React from 'react';

import Container from 'gadgets/container/widget';
import Label from 'gadgets/label/widget';
import Separator from 'gadgets/separator/widget';
import Field from 'gadgets/field/widget';

function prepare(props) {
  return (
    <Container kind="column" grow="1">
      <Label text="Sélectionnez une base" />
      <Separator kind="space" height="10px" />
      <Field
        kind="combo"
        labelText="Base de données"
        listModel=".form.databases"
        model=".form.fromDb"
      />
      <Container kind="row">
        <Field
          kind="gadget"
          name="tablesTable"
          selectionMode="multi"
          frame="true"
          height="300px"
          grow="1"
        />
      </Container>
    </Container>
  );
}

/******************************************************************************/
export default {
  prepare,
};
