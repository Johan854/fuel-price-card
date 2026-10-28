# Fuel Price Card (FR)

Carte Home Assistant pour comparer le prix d'un carburant dans plusieurs stations : classement du moins cher au plus cher, prix au litre **et prix d'un plein**, écart avec la moins chère, tendance sur 7 jours et économie maximale sur un plein. Style verre, thème clair/sombre automatique, éditeur visuel, textes en français.

## Installation (HACS)
1. HACS → ⋮ → *Dépôts personnalisés* → `https://github.com/Johan854/fuel-price-card`, catégorie **Tableau de bord**.
2. Installer, puis recharger le navigateur.

## Exemple
```yaml
type: custom:fuel-price-card
title: Prix du carburant
fuel: Gazole
tank_liters: 40        # taille du plein
show_tank: true        # prix du plein pour chaque station
show_trend: true       # tendance sur 7 jours
show_summary: true
max_rows: 0            # 0 = toutes les stations
stations:
  - { entity: sensor.station_e_leclerc_chantonnay_gazole, name: E.Leclerc Chantonnay }
  - { entity: sensor.station_hyper_u_chantonnay_gazole, name: Hyper U Chantonnay }
```
L'état de chaque capteur doit être le prix au litre (par exemple `1.689`).

## Apparence : nuance de couleur

Dans l'éditeur visuel, à côté du thème :

| Option | Valeurs |
|---|---|
| `nuance` | `theme` (par défaut), `braise`, `ocean`, `lagon`, `foret`, `lavande`, `framboise`, `ambre`, `ardoise`, `perso` |
| `nuance_perso` | Couleur au choix (sélecteur de couleur), utilisée avec `nuance: perso` |
| `intensite` | De `0` (neutre) à `2` (très coloré), `1` par défaut |

La nuance teinte le dégradé de fond (et la couleur d'accent quand la carte en a une). Les couleurs d'état (vert, orange, rouge…) ne changent pas.

**Une seule nuance pour toutes les cartes Johan854** : laisse `nuance: theme` et ajoute à ton thème Home Assistant :

```yaml
carte-nuance: "#2f8fd8"
```

Sans cette ligne, `nuance: theme` garde les couleurs d'origine de la carte.

## Historique des versions

- **1.1.0** : nuance de couleur au choix (8 nuances, couleur personnalisée, intensité, ou nuance commune via `carte-nuance` dans le thème).
