# 📘 Documentation du module goblin-workshop

## Aperçu

Le module `goblin-workshop` est le cœur du framework Xcraft pour la gestion d'entités métier. Il fournit un système complet de création, gestion et manipulation d'entités avec persistance, indexation, validation et interface utilisateur. Ce module orchestre l'ensemble du cycle de vie des entités depuis leur création jusqu'à leur archivage, en passant par la validation, l'hydratation et l'indexation.

La gestion des entités métiers a été succédée par les acteurs de type Elf. Ce module existe pour continuer à supporter les anciennes applications.

## Sommaire

- [Structure du module](#structure-du-module)
- [Fonctionnement global](#fonctionnement-global)
- [Exemples d'utilisation](#exemples-dutilisation)
- [Interactions avec d'autres modules](#interactions-avec-dautres-modules)
- [Configuration avancée](#configuration-avancée)
- [Détails des sources](#détails-des-sources)

## Structure du module

Le module est organisé autour de plusieurs composants principaux :

- **Entity Builder** : Système de construction et configuration des entités métier
- **Workitem Builder** : Générateur d'interfaces utilisateur pour les entités
- **Acteurs de service** : Gestionnaires spécialisés (indexation, cache, export, etc.)
- **Middlewares** : Outils de validation et transformation des données
- **Templates** : Générateurs de code pour les workitems et entités

## Fonctionnement global

Le workshop fonctionne selon un modèle d'acteurs où chaque entité est gérée par un acteur dédié. Le cycle de vie d'une entité comprend :

1. **Création** : Instanciation avec validation du schéma
2. **Hydratation** : Construction des relations et calcul des propriétés dérivées
3. **Persistance** : Sauvegarde en base de données et indexation
4. **Gestion des flux** : Transitions d'état (draft → published → archived)
5. **Destruction** : Suppression avec nettoyage des références

Le système utilise un bus d'événements pour coordonner les actions entre les différents acteurs et maintenir la cohérence des données.

## Exemples d'utilisation

### Création d'une entité simple

```javascript
const entity = {
  type: 'product',
  properties: {
    name: {type: 'string', defaultValue: ''},
    price: {type: 'price', defaultValue: '0.00'},
    active: {type: 'bool', defaultValue: true},
  },
  summaries: {
    info: {type: 'string', defaultValue: ''},
  },
  buildSummaries: function (quest, entity) {
    return {
      info: `${entity.get('name')} - ${entity.get('price')}`,
    };
  },
  indexer: function (quest, entity) {
    return {
      info: entity.get('meta.summaries.info'),
      name: entity.get('name'),
      price: entity.get('price'),
    };
  },
};

const service = buildEntity(entity);
```

### Création d'un workitem

```javascript
const config = {
  type: 'product',
  kind: 'workitem',
  hinters: {
    category: {
      onValidate: editSelectedEntityQuest('category-workitem'),
    },
  },
};

const workitemService = buildWorkitem(config);
```

### Utilisation de l'AggregateBuilder

```javascript
const builder = new AggregateBuilder(quest, entityId);
await builder
  .edit('order@123')
  .add('items', {productId: 'product@456', quantity: 2})
  .patch({status: 'confirmed'})
  .apply();
```

## Interactions avec d'autres modules

- **[goblin-rethink]** : Persistance des données en base RethinkDB
- **[goblin-elasticsearch]** : Indexation et recherche full-text
- **[goblin-nabu]** : Gestion des traductions et textes multilingues
- **[goblin-desktop]** : Interface utilisateur et gestion des workitems
- **[xcraft-core-goblin]** : Framework d'acteurs sous-jacent

## Configuration avancée

| Option                         | Description                                   | Type    | Valeur par défaut |
| ------------------------------ | --------------------------------------------- | ------- | ----------------- |
| `entityStorageProvider`        | Fournisseur de stockage des entités           | string  | `goblin-rethink`  |
| `entityCheckerPolicy`          | Politique de validation (loose/strict)        | string  | `loose`           |
| `mustExistPolicy`              | Politique d'existence obligatoire             | string  | `loose`           |
| `entityStorageServicePoolSize` | Taille du pool de services de stockage        | number  | 10                |
| `enableUndoEditFlow`           | Active le flux d'annulation des modifications | boolean | false             |
| `enableMultiLanguageIndex`     | Active l'indexation multilingue               | boolean | false             |

## Détails des sources

### `workshop.js`

Point d'entrée principal qui expose le service workshop via `xcraftCommands`.

### `lib/service.js`

Service principal du workshop qui orchestre l'initialisation et la coordination de tous les sous-systèmes. Il gère le démarrage des acteurs de service, l'initialisation des bases de données et la configuration globale.

#### Méthodes publiques

- **`init(desktopId, configuration, appName)`** — Initialise le workshop avec la configuration fournie et démarre tous les services nécessaires.
- **`createEntity(entityId, createFor, desktopId, entity, properties, view, ttl)`** — Crée une entité de manière sécurisée avec validation des permissions.
- **`generateEntitiesGraph(output)`** — Génère un graphique des relations entre entités au format Mermaid et Graphviz.
- **`resetIndex()`** — Remet à zéro l'index Elasticsearch et reconstruit les mappings.
- **`maintenance(status, progress, message)`** — Active ou désactive le mode maintenance avec suivi de progression.
- **`ripley(dbSrc, dbDst, timestamp)`** — Lance une opération de migration de données entre bases.
- **`generateWorkitemsTemplates(goblinLib, entityType)`** — Génère automatiquement les templates de workitems pour un type d'entité.

### `lib/entity-builder.js`

Constructeur d'entités qui génère les services Goblin pour chaque type d'entité défini. Il gère la validation des schémas, l'hydratation des relations et la persistance.

#### État et modèle de données

Chaque entité construite possède une structure standardisée avec :

- `meta` : Métadonnées (type, statut, relations, résumés)
- `properties` : Propriétés métier définies dans le schéma
- `private` : Collections d'entités liées par valeur
- `sums` : Valeurs calculées et agrégées

#### Méthodes publiques

- **`create(id, copyId, desktopId, entity, mustExist, status)`** — Crée ou charge une instance d'entité avec gestion des copies et validation.
- **`hydrate(muteChanged, options, force)`** — Reconstruit les propriétés dérivées, résumés et index de l'entité.
- **`change(path, newValue)`** — Modifie une propriété avec validation du schéma.
- **`apply(patch, muteChanged, force)`** — Applique un ensemble de modifications en une seule opération.
- **`loadGraph(loadedBy, level, stopAtLevel, skipped, desktopId)`** — Charge le graphe des entités liées jusqu'au niveau spécifié.
- **`publishEntity()`, `archiveEntity()`, `trashEntity()`** — Gère les transitions d'état des entités.

### `lib/workitem-builder.js`

Générateur d'interfaces utilisateur (workitems) pour les entités. Supporte différents types : workitem, search, list, plugin, datagrid.

### `lib/entity-cache-feeder.js`

Acteur singleton qui gère l'hydratation asynchrone des entités via un système de queues. Il écoute les événements `<hydrate-entity-requested>` et distribue le travail aux workers.

#### Méthodes publiques

- **`init()`** — Initialise les queues d'hydratation par type d'entité et démarre l'écoute des événements.
- **`startWorker(desktopId, entityId, rootAggregateId, rootAggregatePath, options)`** — Lance un worker pour hydrater une entité spécifique.

### `lib/entity-indexer.js`

Acteur singleton responsable de l'indexation des entités dans Elasticsearch. Il collecte les demandes d'indexation et les traite par batch pour optimiser les performances.

#### Méthodes publiques

- **`init()`** — Démarre le collecteur de requêtes d'indexation avec debouncing.
- **`bulk(desktopId, body)`** — Exécute une opération d'indexation en lot et émet les événements de changement.

### `lib/entity-deleter.js`

Acteur singleton qui gère la suppression définitive des entités via une queue dédiée.

#### Méthodes publiques

- **`init()`** — Initialise la queue de suppression et l'écoute des événements.
- **`execute(desktopId, entityId)`** — Supprime définitivement une entité et ses dépendances.

### `lib/aggregate-updater.js`

Acteur singleton qui gère la mise à jour des agrégats lorsqu'une entité enfant est modifiée. Il maintient la cohérence des données dans les hiérarchies d'entités.

#### Méthodes publiques

- **`init()`** — Démarre la queue de mise à jour des agrégats.
- **`applyChanges(desktopId, changes)`** — Applique un ensemble de modifications sur plusieurs entités de manière transactionnelle.

### `lib/entity-flow-updater.js`

Acteur singleton qui gère les transitions d'état des entités (draft → published → archived → trashed) en propageant les changements aux entités liées.

#### Méthodes publiques

- **`init()`** — Initialise la queue de gestion des flux d'entités.
- **`changeEntityStatus(desktopId, entityId, verb)`** — Change le statut d'une entité et propage aux entités dépendantes.

### `lib/activity-monitor.js`

Acteur singleton qui surveille l'activité du système en collectant des métriques sur les queues de traitement et les performances.

#### État et modèle de données

Maintient un état avec :

- `channels` : Métriques par canal d'activité
- `private.isActive` : Indicateur d'activité globale

#### Méthodes publiques

- **`init()`** — Démarre la surveillance avec tick périodique.
- **`sample(channel, sample, current, total)`** — Enregistre un échantillon de métrique pour un canal.

### `lib/activity-monitor-led.js`

Acteur singleton qui gère l'affichage visuel de l'activité du système via un indicateur LED.

#### État et modèle de données

- `isActive` : État d'activité booléen

#### Méthodes publiques

- **`active(on)`** — Active ou désactive l'indicateur LED d'activité.

### `lib/cron-scheduler.js`

Acteur singleton qui gère l'exécution de tâches planifiées basées sur des expressions cron.

#### Méthodes publiques

- **`init(desktopId)`** — Initialise le planificateur et charge les tâches existantes.
- **`schedule(cronJobId)`** — Programme l'exécution d'une tâche cron.
- **`cancelSchedule(cronJobId)`** — Annule la planification d'une tâche.
- **`doJob(cronJobId)`** — Exécute une tâche cron spécifique.

### `lib/entity-counter.js`

Acteur singleton qui gère la génération de numéros séquentiels uniques par type d'entité avec protection contre les accès concurrents.

#### Méthodes publiques

- **`init()`** — Initialise le service de compteurs.
- **`getNextNumber(desktopId, type)`** — Génère le prochain numéro pour un type donné avec verrouillage mutex.

### `lib/entity-driller.js`

Acteur singleton qui gère le pré-chargement d'entités en cache pour optimiser les performances d'affichage.

#### Méthodes publiques

- **`init()`** — Initialise les queues de drill-down et de cache.
- **`drillDown(desktopId, entityIds, view, ttl)`** — Pré-charge des entités avec TTL configurable.

### `lib/entity-exporter.js`

Acteur singleton qui gère l'export d'entités vers différents formats (CSV, JSON) via une queue dédiée.

#### Méthodes publiques

- **`init()`** — Initialise la queue d'export et l'écoute des événements.
- **`startWorker(desktopId, type, query, format, fileName)`** — Lance un worker d'export pour un type d'entité.

### `lib/entity-importer.js`

Acteur singleton qui gère l'import d'entités depuis des sources externes avec transformation des données.

#### Méthodes publiques

- **`init()`** — Initialise la queue d'import et l'écoute des événements.
- **`importRow(desktopId, type, row)`** — Importe une ligne de données pour un type d'entité.

### `lib/entity-schema.js`

Acteur qui gère la validation et la vérification des schémas d'entités. Il permet de contrôler la cohérence des données et de générer des rapports de validation.

#### Méthodes publiques

- **`create(desktopId, entityType)`** — Crée un validateur de schéma pour un type d'entité donné.
- **`checkEntities(desktopId, batchSize, types, options)`** — Vérifie la cohérence des entités en base et génère un rapport CSV.
- **`getType(path)`** — Retourne le type d'une propriété selon son chemin dans le schéma.

### `lib/entity-view.js`

Acteur qui gère les vues personnalisées d'entités avec rafraîchissement automatique lors des changements.

#### Méthodes publiques

- **`create(desktopId, entity, view)`** — Crée une vue d'entité avec projection des champs spécifiés.
- **`mergeView(view, entity)`** — Fusionne une vue avec de nouvelles données d'entité.
- **`refresh()`** — Rafraîchit la vue avec les dernières données de l'entité.

### `entities/cronJob.js`

Entité représentant une tâche planifiée avec expression cron et configuration d'exécution.

#### État et modèle de données

- `enabled` : Activation de la tâche
- `description` : Description de la tâche
- `cronExpr` : Expression cron de planification
- `job` : Configuration du travail à exécuter (event ou quest)

#### Méthodes publiques

- **`toggleEnabled()`** — Active ou désactive la tâche avec validation.
- **`doJob(desktopId)`** — Exécute la tâche selon sa configuration.
- **`checkError()`** — Valide la configuration de la tâche.

### `entities/counter.js`

Entité compteur pour générer des numéros séquentiels uniques par type.

#### État et modèle de données

- `name` : Nom du compteur
- `count` : Valeur actuelle du compteur (démarre à 20000)

#### Méthodes publiques

- **`increment()`** — Incrémente le compteur et retourne la nouvelle valeur.

### `entities/column.js`

Entité représentant une colonne d'affichage dans les listes et tableaux.

#### État et modèle de données

- `type` : Type de données de la colonne
- `text` : Texte d'en-tête affiché
- `path` : Chemin vers la propriété dans l'entité
- `width` : Largeur de la colonne
- `grow` : Facteur d'expansion

#### Méthodes publiques

- **`setType(entityType)`** — Détecte automatiquement le type de la colonne selon le chemin.

### `entities/model.js`

Entité représentant un modèle de données avec ses propriétés.

#### État et modèle de données

- `type` : Type du modèle
- `properties` : Collection des propriétés du modèle

### `entities/property.js`

Entité représentant une propriété d'un modèle de données.

#### État et modèle de données

- `name` : Nom de la propriété
- `type` : Type de données de la propriété

### `entities/view.js`

Entité représentant une vue personnalisée avec colonnes et requêtes.

#### État et modèle de données

- `name` : Nom de la vue
- `columns` : Collection des colonnes de la vue
- `query` : Requête de filtrage des données

#### Méthodes publiques

- **`mergeDefaultColumns(columns)`** — Fusionne les colonnes par défaut avec les colonnes existantes.
- **`buildQuery()`** — Construit la requête à partir des colonnes configurées.
- **`validateColumns()`** — Valide les types des colonnes selon l'entité cible.

### `entities/workitem.js`

Entité représentant un workitem personnalisé avec ses champs.

#### État et modèle de données

- `name` : Nom du workitem
- `fields` : Collection des champs du workitem

### `entities/field.js`

Entité représentant un champ personnalisé dans un workitem.

#### État et modèle de données

- `kind` : Type de champ (field par défaut)
- `labelText` : Texte du label affiché
- `model` : Modèle de données associé

### `lib/SmartId.js`

Classe utilitaire pour manipuler et valider les identifiants d'entités avec vérification d'existence.

#### Méthodes publiques

- **`exist(quest)`** — Vérifie l'existence de l'entité en cache ou en base de données.

### `lib/AggregateBuilder.js`

Builder pour construire et appliquer des modifications complexes sur plusieurs entités de manière transactionnelle.

#### Méthodes publiques

- **`edit(entityId)`** — Définit l'entité à modifier.
- **`run(quest, payload)`** — Exécute une quête sur l'entité courante.
- **`patch(patch)`** — Applique des modifications sur l'entité.
- **`add(collection, refOrPayload)`** — Ajoute un élément à une collection.
- **`remove(collection, entityId)`** — Supprime un élément d'une collection.
- **`apply(desktopId)`** — Applique toutes les modifications en une transaction.

### `lib/AlertsBuilder.js`

Builder pour construire des alertes métier structurées avec groupement et priorités.

#### Méthodes publiques

- **`addError(message, groupId, priority)`** — Ajoute une erreur avec priorité.
- **`addWarning(message, groupId, priority)`** — Ajoute un avertissement.
- **`addInfo(message, groupId, priority)`** — Ajoute une information.
- **`build()`** — Construit la structure finale des alertes groupées.

### `lib/MarkdownBuilder.js`

Builder pour construire du contenu Markdown avec support des références translatables.

#### Méthodes publiques

- **`addTitle(title)`** — Ajoute un titre de niveau 1.
- **`addBlock(text)`** — Ajoute un bloc de texte.
- **`addUnorderedList(items)`** — Ajoute une liste à puces.
- **`bold(text)`, `italic(text)`** — Formatage de texte.
- **`toString()`** — Génère le Markdown final avec gestion des références.

### `lib/FileOutput.js`

Classes utilitaires pour l'export de données vers des fichiers.

#### Classes

- **`CSVOutput`** — Export au format CSV avec en-têtes configurables.
- **`JSONOutput`** — Export au format JSON avec streaming.
- **`FileOutput`** — Classe de base pour l'écriture de fichiers.

### `graph-loader-queue.js` et `graph-loader-queue-worker.js`

Système de queue pour le chargement asynchrone des graphes d'entités avec gestion de priorités.

#### Méthodes publiques

- **`workQuest(desktopId, workitemId, forDesktopId, recycle)`** — Charge le graphe d'un workitem de manière asynchrone.

### `rehydrate-entities.js` et `rehydrate-entities-worker.js`

Système de queue pour la réhydratation en lot d'entités avec progression et notifications.

#### Méthodes publiques

- **`workQuest(desktopId, userDesktopId, data)`** — Réhydrate les entités sélectionnées avec options configurables.

### `reindex-entities.js` et `reindex-entities-worker.js`

Système de queue pour la réindexation en lot d'entités avec génération de rapports.

#### Méthodes publiques

- **`workQuest(desktopId, userDesktopId, data)`** — Réindexe les entités sélectionnées et génère un rapport CSV.

### Fichiers de configuration des entités

Les fichiers `*-hinter.js`, `*-plugin.js`, `*-search.js`, `*-workitem.js` exposent des configurations standardisées pour les différents types d'interfaces utilisateur associées aux entités.

### `widgets/*/service.js`

Services des workitems générés automatiquement qui exposent les interfaces utilisateur pour chaque type d'entité.

### `widgets/*/ui.js`

Composants React pour l'affichage et l'édition des entités dans l'interface utilisateur.

---

_Ce document a été mis à jour pour refléter l'état actuel du code source._

[goblin-rethink]: https://github.com/Xcraft-Inc/goblin-rethink
[goblin-elasticsearch]: https://github.com/Xcraft-Inc/goblin-elasticsearch
[goblin-nabu]: https://github.com/Xcraft-Inc/goblin-nabu
[goblin-desktop]: https://github.com/Xcraft-Inc/goblin-desktop
[xcraft-core-goblin]: https://github.com/Xcraft-Inc/xcraft-core-goblin