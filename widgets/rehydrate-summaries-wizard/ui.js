import React from 'react';

import Container from 'gadgets/container/widget';
import Label from 'gadgets/label/widget';
import Separator from 'gadgets/separator/widget';
import Field from 'gadgets/field/widget';

function prepare(props) {
  return (
    <Container kind="column" grow="1">
      <Label text="Sélectionnez les entités à réhydrater" />

      <Field
        kind="bool"
        model=".form.onlyPublished"
        labelText="Seulement les publiés"
      />

      <Field
        kind="bool"
        model=".form.mustBuildSummaries"
        labelText="Reconstruire les descriptions"
      />

      <Field
        kind="bool"
        model=".form.mustIndex"
        labelText="Ré-indexer dans le moteur de recherche"
      />

      <Field kind="bool" model=".form.mustCompute" labelText="Recalculer" />

      <Field
        kind="bool"
        model=".form.mustRebuild"
        labelText="Consolider les valeurs manquantes"
      />

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
    </Container>
  );
}

/******************************************************************************/
export default {
  prepare,
};
