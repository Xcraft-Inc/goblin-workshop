# 📘 goblin-workshop

## Aperçu

Le module `goblin-workshop` est le cœur du framework Xcraft pour la gestion d'entités métier. Il fournit un système complet de création, gestion et manipulation d'entités avec persistance, indexation, validation et interface utilisateur. Ce module orchestre l'ensemble du cycle de vie des entités depuis leur création jusqu'à leur archivage, en passant par la validation, l'hydratation et l'indexation.

**Note importante** : La gestion des entités métiers a été succédée par les acteurs de type Elf. Ce module existe pour continuer à supporter les anciennes applications basées sur le système Goblin legacy.

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
- **Queues et Workers** : Système de traitement asynchrone pour les opérations lourdes

## Fonctionnement global

Le workshop fonctionne selon un modèle d'acteurs Goblin où chaque entité est gérée par un acteur dédié. Le cycle de vie d'une entité comprend :

1. **Création** : Instanciation avec validation du schéma et génération d'ID unique
2. **Hydratation** : Construction des relations, calcul des propriétés dérivées et indexation
3. **Persistance** : Sauvegarde en base de données RethinkDB et indexation Elasticsearch
4. **Gestion des flux** : Transitions d'état (draft → published → archived → trashed)
5. **Destruction** : Suppression avec nettoyage des références et cascade

Le système utilise un bus d'événements pour coordonner les actions entre les différents acteurs et maintenir la cohérence des données. Les opérations lourdes sont déléguées à des workers via des queues pour éviter de bloquer l'interface utilisateur.

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
  onNew: function (quest, id, name, price) {
    return {id, name, price};
  },
};

const service = buildEntity(entity);
```

### Création d'un workitem de recherche

```javascript
const config = {
  type: 'product',
  kind: 'search',
  title: T('Produits'),
  list: 'product',
  hinters: {
    product: {
      onValidate: editSelectedEntityQuest('product-workitem'),
    },
  },
};

const searchService = buildWorkitem(config);
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

### Création d'une tâche cron

```javascript
// Création via l'API
await quest.create('cronJob', {
  id: 'cronJob@daily-cleanup',
  desktopId,
  description: 'Nettoyage quotidien',
  cronExpr: '0 2 * * *', // Tous les jours à 2h
  job: {
    jobType: 'event',
    event: 'cleanup-requested',
    eventArgs: '{"force": true}',
  },
});
```

## Interactions avec d'autres modules

- **[goblin-rethink]** : Persistance des données en base RethinkDB
- **[goblin-elasticsearch]** : Indexation et recherche full-text
- **[goblin-nabu]** : Gestion des traductions et textes multilingues
- **[goblin-desktop]** : Interface utilisateur et gestion des workitems
- **[xcraft-core-goblin]** : Framework d'acteurs sous-jacent
- **[goblin-laboratory]** : Composants UI de base pour les widgets

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
- **`reindexEntitiesFromStorage(desktopId, type, status, batchSize, locales)`** — Réindexe les entités d'un type donné depuis le stockage.
- **`getMandateStorageRootPath(desktopId)`** — Récupère le chemin racine de stockage du mandat.
- **`getMandateStorageServerHostName(desktopId)`** — Récupère le nom d'hôte du serveur de stockage.
- **`getMandateDefaultPasswordLength(desktopId)`** — Récupère la longueur par défaut des mots de passe.
- **`requestEntityDeletion(entityId, desktopId)`** — Demande la suppression d'une entité via la queue.
- **`createNewEntity(goblinLib, entity)`** — Génère les fichiers de service pour une nouvelle entité.

### `lib/entity-builder.js`

Constructeur d'entités qui génère les services Goblin pour chaque type d'entité défini. Il gère la validation des schémas, l'hydratation des relations et la persistance.

#### État et modèle de données

Chaque entité construite possède une structure standardisée avec :

- `meta` : Métadonnées (type, statut, relations, résumés, index)
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
- **`persist(ripley)`** — Sauvegarde l'entité en base et met à jour l'index.
- **`updateAggregate(entityId, desktopId)`** — Met à jour l'agrégat parent lors de changements d'entité enfant.
- **`rebuild()`** — Reconstruit les valeurs manquantes dans les collections.
- **`hardDeleteEntity(entity)`** — Supprime définitivement une entité et ses dépendances.

### `lib/workitem-builder.js`

Générateur d'interfaces utilisateur (workitems) pour les entités. Supporte différents types : workitem, search, list, plugin, datagrid.

### `lib/entity-cache-feeder.js`

Acteur singleton qui gère l'hydratation asynchrone des entités via un système de queues. Il écoute les événements `<hydrate-entity-requested>` et distribue le travail aux workers.

#### Méthodes publiques

- **`init()`** — Initialise les queues d'hydratation par type d'entité et démarre l'écoute des événements.
- **`startWorker(desktopId, entityId, rootAggregateId, rootAggregatePath, options)`** — Lance un worker pour hydrater une entité spécifique.
- **`startCleanWorker(desktopId, entityId, patch, propsToRemove)`** — Lance un worker pour nettoyer ou corriger une entité.

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

- `channels` : Métriques par canal d'activité avec échantillons temporels
- `private.isActive` : Indicateur d'activité globale
- `private.channels` : Données internes des canaux avec historique

#### Méthodes publiques

- **`init()`** — Démarre la surveillance avec tick périodique et souscription aux événements de queue.
- **`sample(channel, sample, current, total)`** — Enregistre un échantillon de métrique pour un canal.
- **`disposeChannel(channel)`** — Supprime un canal de surveillance.
- **`tick()`** — Lance le processus de tick périodique pour la mise à jour des métriques.
- **`unsubscribe()`** — Désabonne le moniteur des événements de queue.

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
- **`scheduleAll()`** — Programme toutes les tâches cron activées.
- **`schedule(cronJobId)`** — Programme l'exécution d'une tâche cron.
- **`cancelSchedule(cronJobId)`** — Annule la planification d'une tâche.
- **`doJob(cronJobId)`** — Exécute une tâche cron spécifique.
- **`testQuest(args)`** — Quête de test pour valider le fonctionnement du planificateur.
- **`testQuestError()`** — Quête de test qui génère une erreur pour tester la gestion d'erreurs.

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
- **`startWorker(desktopId, entityIds, createMissing, view, ttl)`** — Lance un worker de drill-down.
- **`startCacheWorker(desktopId, entities, ttl)`** — Lance un worker de mise en cache.

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

- `enabled` : Activation de la tâche (boolean)
- `description` : Description de la tâche (string)
- `cronExpr` : Expression cron de planification (string, défaut: '0 0 \* \* \*')
- `job` : Configuration du travail à exécuter (object)
  - `jobType` : Type de job ('event' ou 'quest')
  - `event` : Nom de l'événement à émettre
  - `eventArgs` : Arguments JSON pour l'événement
  - `goblinId` : ID du goblin pour les quêtes
  - `questName` : Nom de la quête à exécuter
  - `questArgs` : Arguments JSON pour la quête
- `error` : Message d'erreur de validation (string)

#### Méthodes publiques

- **`toggleEnabled()`** — Active ou désactive la tâche avec validation de la configuration.
- **`doJob(desktopId)`** — Exécute la tâche selon sa configuration (event ou quest).
- **`checkError()`** — Valide la configuration de la tâche et retourne les erreurs.

### `entities/counter.js`

Entité compteur pour générer des numéros séquentiels uniques par type.

#### État et modèle de données

- `name` : Nom du compteur (string)
- `count` : Valeur actuelle du compteur (number, démarre à 20000)

#### Méthodes publiques

- **`increment()`** — Incrémente le compteur et retourne la nouvelle valeur.

### `entities/column.js`

Entité représentant une colonne d'affichage dans les listes et tableaux.

#### État et modèle de données

- `type` : Type de données de la colonne (enum depuis typeList)
- `text` : Texte d'en-tête affiché (translatable)
- `path` : Chemin vers la propriété dans l'entité (string)
- `width` : Largeur de la colonne (string)
- `grow` : Facteur d'expansion (string)

#### Méthodes publiques

- **`setType(entityType)`** — Détecte automatiquement le type de la colonne selon le chemin et le schéma de l'entité.

### `entities/model.js`

Entité représentant un modèle de données avec ses propriétés.

#### État et modèle de données

- `type` : Type du modèle (string)
- `properties` : Collection des propriétés du modèle (property[0..n])

### `entities/property.js`

Entité représentant une propriété d'un modèle de données.

#### État et modèle de données

- `name` : Nom de la propriété (string)
- `type` : Type de données de la propriété (string)

### `entities/view.js`

Entité représentant une vue personnalisée avec colonnes et requêtes.

#### État et modèle de données

- `name` : Nom de la vue (string)
- `columns` : Collection des colonnes de la vue (column[1..n])
- `query` : Requête de filtrage des données (array)

#### Méthodes publiques

- **`mergeDefaultColumns(columns)`** — Fusionne les colonnes par défaut avec les colonnes existantes sans duplication.
- **`buildQuery()`** — Construit la requête à partir des colonnes configurées en optimisant la structure.
- **`validateColumns()`** — Valide les types des colonnes selon l'entité cible.

### `entities/workitem.js`

Entité représentant un workitem personnalisé avec ses champs.

#### État et modèle de données

- `name` : Nom du workitem (string)
- `fields` : Collection des champs du workitem (field[0..n])

### `entities/field.js`

Entité représentant un champ personnalisé dans un workitem.

#### État et modèle de données

- `kind` : Type de champ (string, défaut: 'field')
- `labelText` : Texte du label affiché (string, défaut: 'Custom field')
- `model` : Modèle de données associé (string)

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
- **`clear(collection)`** — Vide une collection.
- **`apply(desktopId)`** — Applique toutes les modifications en une transaction.

### `lib/AlertsBuilder.js`

Builder pour construire des alertes métier structurées avec groupement et priorités.

#### Méthodes publiques

- **`add(type, message, groupId, priority)`** — Ajoute une alerte avec type, groupe et priorité.
- **`addError(message, groupId, priority)`** — Ajoute une erreur avec priorité.
- **`addWarning(message, groupId, priority)`** — Ajoute un avertissement.
- **`addInfo(message, groupId, priority)`** — Ajoute une information.
- **`addGroup(groupId, title)`** — Définit un groupe d'alertes avec titre.
- **`build()`** — Construit la structure finale des alertes groupées et triées par priorité.

### `lib/MarkdownBuilder.js`

Builder pour construire du contenu Markdown avec support des références translatables.

#### Méthodes publiques

- **`addTitle(title)`** — Ajoute un titre de niveau 1.
- **`addBlock(text)`** — Ajoute un bloc de texte.
- **`addUnorderedList(items)`** — Ajoute une liste à puces.
- **`addOrderedList(items)`** — Ajoute une liste numérotée.
- **`bold(text)`, `italic(text)`** — Formatage de texte.
- **`joinWords(args)`, `joinSentences(args)`, `joinLines(args)`** — Méthodes de jointure de texte.
- **`toString()`** — Génère le Markdown final avec gestion des références translatables.

### `lib/FileOutput.js`

Classes utilitaires pour l'export de données vers des fichiers avec streaming.

#### Classes

- **`CSVOutput`** — Export au format CSV avec en-têtes configurables et encodage UTF-8 BOM.
- **`JSONOutput`** — Export au format JSON avec streaming pour les gros volumes.
- **`FileOutput`** — Classe de base pour l'écriture de fichiers avec gestion des callbacks.

### `lib/cryoManager.js` et `lib/cryoReader.js`

Gestionnaire et lecteur pour l'accès aux données cryogéniques (données gelées/archivées).

#### Méthodes publiques

- **`reader(quest)`** — Obtient un lecteur pour la session courante.
- **`get(quest, documentId)`** — Récupère l'état d'un document depuis les données cryogéniques.

### `graph-loader-queue.js` et `graph-loader-queue-worker.js`

Système de queue pour le chargement asynchrone des graphes d'entités avec gestion de priorités.

#### Méthodes publiques

- **`workQuest(desktopId, workitemId, forDesktopId, recycle)`** — Charge le graphe d'un workitem de manière asynchrone avec gestion des erreurs.

### `rehydrate-entities.js` et `rehydrate-entities-worker.js`

Système de queue pour la réhydratation en lot d'entités avec progression et notifications.

#### Méthodes publiques

- **`workQuest(desktopId, userDesktopId, data)`** — Réhydrate les entités sélectionnées par statut avec options configurables et suivi de progression.

### `reindex-entities.js` et `reindex-entities-worker.js`

Système de queue pour la réindexation en lot d'entités avec génération de rapports.

#### Méthodes publiques

- **`workQuest(desktopId, userDesktopId, data)`** — Réindexe les entités sélectionnées et génère un rapport CSV des opérations.

### Workers spécialisés

#### `lib/entity-cache-feeder-worker.js`

Worker qui exécute l'hydratation d'une entité spécifique avec gestion des options et notifications.

#### `lib/entity-clean-worker.js`

Worker qui applique des corrections et nettoyages sur les entités avec validation.

#### `lib/entity-driller-worker.js`

Worker qui pré-charge des entités en cache ou exécute des vues spécialisées.

#### `lib/entity-exporter-worker.js`

Worker qui exporte des entités vers des fichiers CSV ou JSON avec requêtes personnalisées.

#### `lib/entity-importer-worker.js`

Worker qui importe des données externes en créant ou mettant à jour des entités.

#### `lib/entity-flow-updater-worker.js`

Worker qui propage les changements de statut dans les hiérarchies d'entités.

#### `lib/aggregate-updater-worker.js`

Worker qui met à jour les agrégats parents lors de modifications d'entités enfants.

### Widgets spécialisés

#### `widgets/data-check-wizard/`

Assistant pour la vérification et le nettoyage de l'intégrité des données avec interface graphique.

#### `widgets/rehydrate-entities-wizard/`

Assistant pour la réhydratation en lot d'entités avec sélection des tables et options.

#### `widgets/reindex-entities-wizard/`

Assistant pour la réindexation en lot d'entités avec possibilité de reset complet.

#### `widgets/edit-by-id-wizard/`

Assistant pour ouvrir directement une entité par son identifiant.

#### `widgets/view-json-wizard/`

Assistant pour visualiser le JSON brut d'une entité.

#### `widgets/open-entity-wizard/`

Assistant pour ouvrir une entité existante dans un workitem.

#### `widgets/hinter/`

Widget de recherche avec auto-complétion et navigation par clavier.

#### `widgets/list/`

Widget de liste avec pagination, tri, filtres et facettes pour l'affichage d'entités.

#### `widgets/detail/`

Widget de détail qui affiche une entité en mode lecture seule avec cache intelligent.

### Fichiers de configuration des entités

Les fichiers `*-hinter.js`, `*-plugin.js`, `*-search.js`, `*-workitem.js` exposent des configurations standardisées pour les différents types d'interfaces utilisateur associées aux entités :

- **Hinters** : Interfaces de recherche avec auto-complétion
- **Plugins** : Composants d'édition de collections
- **Search** : Interfaces de recherche avancée avec facettes
- **Workitems** : Formulaires d'édition d'entités

### `lib/typeList.js`

Liste des types de données supportés par le système d'entités, incluant les types primitifs et les types métier spécialisés.

### `lib/list-helpers.js`

Utilitaires pour la gestion des listes et colonnes d'affichage avec extraction de propriétés et formatage.

### `lib/schemas-builder.js`

Générateur de schémas JSON Schema à partir des configurations d'entités pour la validation et la documentation.

### `lib/prepareEntityForSchema.js`

Utilitaire pour préparer une entité en vue de sa validation contre un schéma en extrayant uniquement les propriétés pertinentes.

### `lib/middlewares/`

Collection de middlewares pour la transformation et validation des entités :

- **`checkEntity.js`** : Validation complète des entités contre leur schéma
- **`normalizeEntity.js`** : Normalisation des entités avec valeurs par défaut
- **`migrateCollectionFT2T.js`** : Migration de collections entre types
- **`migrateRootEntityFromCollection.js`** : Extraction d'entités racines depuis des collections

### `lib/entity-check-helpers.js`

Utilitaires pour la validation des entités avec génération de notifications d'erreur.

### `lib/entity-meta.js`

Utilitaire pour la gestion des métadonnées des entités (type, relations, statut, etc.).

### `lib/cryo-processor.js`

Processeur pour les opérations de migration et restauration de données cryogéniques.

### `lib/entity-graph.js`

Générateur de graphiques de relations entre entités aux formats Mermaid et Graphviz.

### `templates/`

Générateurs de code pour créer automatiquement les fichiers de service et d'interface :

- **`entity/service.js`** : Template pour les services d'entité
- **`workitem/service.js`** et **`workitem/ui.js`** : Templates pour les workitems
- **`serviceHandlers/`** : Templates pour les handlers de service (entity, hinter, plugin, search, workitem)

---

_Ce document a été mis à jour pour refléter l'état actuel du code source._

[goblin-rethink]: https://github.com/Xcraft-Inc/goblin-rethink
[goblin-elasticsearch]: https://github.com/Xcraft-Inc/goblin-elasticsearch
[goblin-nabu]: https://github.com/Xcraft-Inc/goblin-nabu
[goblin-desktop]: https://github.com/Xcraft-Inc/goblin-desktop
[goblin-laboratory]: https://github.com/Xcraft-Inc/goblin-laboratory
[xcraft-core-goblin]: https://github.com/Xcraft-Inc/xcraft-core-goblin