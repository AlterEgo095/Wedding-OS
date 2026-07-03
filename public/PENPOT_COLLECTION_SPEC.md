# PENPOT COLLECTION SPECIFICATION

**Le contrat entre le designer et Wedding OS.**

Les designs appartiennent EXCLUSIVEMENT à Penpot. Wedding OS ne crée jamais de designs.
Wedding OS détecte automatiquement les frames Penpot par leur **nom**, suivant la convention ci-dessous.

---

## Convention de nommage

Chaque frame dans Penpot doit être nommée selon le pattern :

```
{CODE}/{PACK}/{MODULE}/{VARIANTE}
```

### Codes de Collection (1er segment)

| Collection       | Code |
|------------------|------|
| Royal Gold       | `RG` |
| Royal Black      | `RB` |
| White Romance    | `WR` |
| Kente Prestige   | `KP` |
| Beach Luxury     | `BL` |

### Packs (2e segment)

| Pack           | Token            |
|----------------|------------------|
| Website        | `Website`        |
| Invitations    | `Invitations`    |
| Print          | `Print`          |
| Communication  | `Communication`  |
| Luxury         | `Luxury`         |

### Modules (3e segment)

#### Website
`Hero` · `Countdown` · `Story` · `Gallery` · `Programme` · `RSVP` · `Footer` · `Loader` · `Splash`

#### Invitations
`Standard` · `VIP` · `Famille` · `Couple` · `Sponsor` · `Presse` · `Numerique` · `Impression`

#### Print
`Badge` · `QR` · `Parking` · `Table-Number` · `Place-Card` · `Menu` · `Gift` · `Remerciement`

#### Communication
`Facebook` · `Instagram` · `Story` · `Email` · `Banner` · `Affiche` · `Rollup` · `WhatsApp`

#### Luxury
`Animations` · `Transitions` · `Palette` · `Typography` · `Effects`

### Variantes (4e segment)

`A` · `B` · `C` · `D`

---

## Exemples concrets

Pour la Collection **Royal Gold** (code `RG`), le designer doit créer ces frames dans Penpot :

```
RG/Website/Hero/A          → Hero, variante A (cinématique)
RG/Website/Hero/B          → Hero, variante B (split asymétrique)
RG/Website/Hero/C          → Hero, variante C (voile overlay)
RG/Website/Countdown/A     → Countdown, variante A
RG/Website/Story/A         → Story timeline
RG/Website/Gallery/A       → Galerie masonry
RG/Website/Programme/A     → Programme
RG/Website/RSVP/A          → RSVP
RG/Website/Footer/A        → Footer
RG/Website/Loader/A        → Loader
RG/Website/Splash/A        → Splash

RG/Invitations/Standard/A  → Invitation Standard, variante A (classique)
RG/Invitations/Standard/B  → Invitation Standard, variante B (moderne)
RG/Invitations/Standard/C  → Invitation Standard, variante C (cinématique)
RG/Invitations/Standard/D  → Invitation Standard, variante D (minimal)
RG/Invitations/VIP/A       → Invitation VIP, variante A (couronne)
RG/Invitations/VIP/B       → Invitation VIP, variante B (double or)
RG/Invitations/Famille/A
RG/Invitations/Couple/A
RG/Invitations/Sponsor/A
RG/Invitations/Presse/A
RG/Invitations/Numerique/A
RG/Invitations/Impression/A

RG/Print/Badge/A
RG/Print/QR/A
RG/Print/Parking/A
RG/Print/Table-Number/A
RG/Print/Place-Card/A
RG/Print/Menu/A
RG/Print/Gift/A
RG/Print/Remerciement/A

RG/Communication/Facebook/A
RG/Communication/Instagram/A
RG/Communication/Story/A
RG/Communication/Email/A
RG/Communication/Banner/A
RG/Communication/Affiche/A
RG/Communication/Rollup/A
RG/Communication/WhatsApp/A

RG/Luxury/Animations/A
RG/Luxury/Transitions/A
RG/Luxury/Palette/A
RG/Luxury/Typography/A
RG/Luxury/Effects/A
```

**Total pour une Collection complète : 44 frames.**

---

## Organisation des pages Penpot

Recommandation : **une page Penpot par pack**. Le fichier Penpot contient donc 5 pages :

1. Page **Website** → contient toutes les frames `RG/Website/*`
2. Page **Invitations** → contient toutes les frames `RG/Invitations/*`
3. Page **Print** → contient toutes les frames `RG/Print/*`
4. Page **Communication** → contient toutes les frames `RG/Communication/*`
5. Page **Luxury** → contient toutes les frames `RG/Luxury/*`

Wedding OS détecte automatiquement quel module appartient à quel pack grâce au 2e segment du nom de frame — pas besoin de matcher les pages.

---

## Modules requis (validation gate)

Pour qu'une Collection soit **publiable** (statut DETECTED), ces modules doivent avoir au moins 1 variante détectée :

- **Website** : Hero, Countdown, Story, Gallery, Programme, RSVP
- **Invitations** : Standard, VIP, Famille, Numerique
- **Print** : Badge, QR, Table-Number, Place-Card
- **Communication** : Facebook, Instagram, Story, WhatsApp
- **Luxury** : Animations, Transitions, Palette, Typography

Les autres modules (Footer, Loader, Splash, Couple, Sponsor, Presse, Impression, Parking, Menu, Gift, Remerciement, Email, Banner, Affiche, Rollup, Effects) sont optionnels mais recommandés pour une Collection complète.

---

## Workflow de production

1. Le designer crée le fichier Penpot pour la Collection (ex: Royal Gold)
2. Il organise 5 pages (Website, Invitations, Print, Communication, Luxury)
3. Il crée toutes les frames en respectant **strictement** la convention de nommage
4. Il publie/partage le fichier (Share → Public link)
5. Dans Wedding OS (Designer Portal / Factory), il colle l'URL Penpot
6. Wedding OS :
   - Parse l'URL (extrait le fileId)
   - Tente de récupérer l'arbre des frames via l'API Penpot
   - Si l'API n'est pas accessible (fichier privé), demande au designer de coller un registry JSON
   - Matche chaque frame par son nom → déduit (pack, module, variante)
   - Valide la complétude (modules requis présents)
   - Calcule le score qualité + % de complétude
   - Stamp les frameIds sur la Collection
   - Bump la version (patch/minor/major selon les changements)
7. Si validation OK → la Collection apparaît dans le catalogue avec statut "Détectée & validée"
8. Le commercial peut alors la déployer sur un mariage

---

## Registry JSON (fallback)

Si l'API Penpot n'est pas accessible (fichier privé ou self-hosted sans endpoint public), le designer peut exporter manuellement la liste des frames et la coller dans Wedding OS. Format attendu :

```json
{
  "pages": [
    { "id": "page-uuid-1", "name": "Website" },
    { "id": "page-uuid-2", "name": "Invitations" }
  ],
  "frames": [
    { "id": "frame-uuid-1", "name": "RG/Website/Hero/A", "pageId": "page-uuid-1", "width": 1440, "height": 810 },
    { "id": "frame-uuid-2", "name": "RG/Website/Hero/B", "pageId": "page-uuid-1", "width": 1440, "height": 810 },
    { "id": "frame-uuid-3", "name": "RG/Invitations/Standard/A", "pageId": "page-uuid-2", "width": 600, "height": 800 }
  ]
}
```

Le champ `name` est **obligatoire** et doit suivre la convention. Les autres champs sont optionnels mais recommandés.

---

## Ce que Wedding OS NE fait PAS

- ❌ Wedding OS ne crée jamais de designs en React/Tailwind
- ❌ Wedding OS ne duplique jamais les capacités graphiques de Penpot
- ❌ Wedding OS n'édite jamais les frames Penpot
- ❌ Wedding OS ne remplace jamais Penpot comme studio de design

## Ce que Wedding OS FAIT

- ✅ Détecte automatiquement les frames Penpot par convention de nommage
- ✅ Valide la complétude des 5 packs
- ✅ Calcule un score qualité + % de complétude
- ✅ Gère les versions (semver : patch/minor/major)
- ✅ Catalogue les Collections publiées
- ✅ Déploie la Collection choisie sur un mariage (écrit la référence Penpot + tokens sur le Theme)
- ✅ L'IA ajuste post-déploiement uniquement (palette, texte, photos) — jamais de création
