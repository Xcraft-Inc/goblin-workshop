import React from 'react';

import Container from 'gadgets/container/widget';
import Label from 'gadgets/label/widget';
import Separator from 'gadgets/separator/widget';
import Field from 'gadgets/field/widget';

function prepare(props) {
  return (
    <Container kind="column" grow="1">
      <Field
        kind="combo"
        labelText="Mandat source"
        listModel=".form.databases"
        model=".form.fromDb"
      />
      <Separator kind="space" height="10px" />
      <Label text="Sélectionnez les entités à répliquer" />
      <Container kind="row">
        <Field
          kind="gadget"
          name="tablesTable"
          selectionMode="multi"
          frame="true"
          hasButtons="true"
          height="300px"
          grow="1"
        />
      </Container>
      <Separator kind="space" height="10px" />
      <Field
        kind="bool"
        model=".form.reindex"
        labelWidth="0px"
        labelText="Réindexer les entités"
      />
    </Container>
  );
}

/******************************************************************************/
export default {
  prepare,
};
