# LIVE-WEDDING-CHECKLIST.md — V5.1 (post sprint P2, 2026-09-01)
## Checklist opérable pour livrer un mariage réel avec Wedding OS
**Usage** : un opérateur peut suivre cette checklist demain. Chaque élément : `[ ] TODO` / `[x] DONE` / `[!] BLOCKED`

> ✅ **MISE À JOUR SPRINTS P0+P1 (2026-09-01)** — Les anciennes « règles d'or » n°2
> (création mariage 404) et n°3 (restart photos) sont **obsolètes** : ces deux bugs
> sont réparés et vérifiés en production (commits c04e31a et 75a3687). Le QR PNG
> téléchargé est désormais un vrai PNG (7cab107). Les photos et la musique sont
> visibles immédiatement après upload, sans restart.
>
> ✅ **MISE À JOUR SPRINT P2 (2026-09-01) — DERNIÈRE RÈGLE D'OR LEVÉE** — La règle
> n°1 (DRAFT = formulaires vides dans Paramètres/Histoire/Chronologie/Médias) est
> **réparée** (commit cf861b6, P1-7) : un mariage en DRAFT est désormais pleinement
> éditable par ses organisateurs — configurez AVANT de publier, dans l'ordre que
> vous voulez. Le site public d'un DRAFT reste invisible (404) jusqu'à la
> publication : aucun changement côté invités.
> Autres chantiers P2 : l'onglet « Temps réel » (widgets live orphelins) a été
> retiré de l'admin (P1-9) et l'alias d'API `/api/invitations` supprimé (P1-10,
> utiliser `/api/collections`).

---

## 1. CLIENT (informations à recueillir)
- [ ] Noms des mariés (bride + groom)
- [ ] Date + heure du mariage
- [ ] Lieu (nom, adresse, ville, éventuellement coordonnées GPS)
- [ ] Photos du couple (au moins 1 photo héro, idéalement 2)
- [ ] Liste des invités (noms, téléphones/emails, catégories)
- [ ] Textes : message d'invitation, histoire du couple, programme
- [ ] Date limite RSVP
- [ ] Validation du tarif/forfait avec le client

## 2. WEDDING (création)
- [ ] Depuis le dashboard org (`/org/[slug-org]/admin`) → bouton **« Créer un mariage »** → formulaire `/org/[slug-org]/admin/weddings/new` *(réparé sprint P0-1)*
- [ ] Alternative : `https://wedding.hpph.net/org/signup` (nouvelle org + 1er mariage)
- [ ] Saisir le mariage (noms couple, date, lieu) → le slug est auto-généré
- [ ] Note : le mot de passe organisateur = SEUL accès du couple (jamais d'identifiants admin/plateforme)

## 3. COUPLE (configuration)
- [ ] Se connecter : `/org/[slug-org]/admin/login`
- [ ] Ouvrir le mariage → `/w/[slug-mariage]/admin`
- [ ] Onglet **Designer** → choisir la collection de design (Royal Gold / Royal Black / Royal Emerald / White Romance…)
- [ ] **Publier** (bouton « Publier ») — le site public devient accessible *(le DRAFT est désormais pleinement éditable — P1-7 ; publier tôt reste possible mais n'est plus obligatoire)*
- [ ] Onglet **Paramètres** → bride_name, groom_name, site_title, site_subtitle
- [ ] wedding_date, venue_name, venue_address, venue_city, venue_time
- [ ] contact_email, contact_phone, hashtag
- [ ] invitation_message, rsvp_message, thank_you_message, rsvp_deadline
- [ ] *(optionnel, recommandé pour mariages publics)* **Code d'accès invités** (Paramètres → Contact & RSVP) : protège la recherche d'invités par nom — les invités devront saisir ce code *(nouveau sprint P1-4)*
- [ ] Sauvegarder puis **rafraîchir** pour vérifier la persistance

## 4. DATE / LIEU
- [ ] Vérifier la date affichée sur la page publique (fuseau : Africa/Kinshasa par défaut)
- [ ] Vérifier l'adresse complète et l'heure
- [ ] Vérifier l'affichage mobile ET desktop de la date/lieu

## 5. DESIGN
- [ ] Onglet Designer : couleurs (primaryColor/accentColor), polices
- [ ] Onglet Thème / Apparence : personnalisation fine
- [ ] Onglet **Invitation Studio** : templates d'invitation + photo studio
- [ ] Prévisualiser avant envoi (preview)

## 6. PHOTOS / MÉDIAS
- [ ] Onglet **Médias** → upload photos couple (JPEG/PNG, ≤ 10 Mo, signatures vérifiées)
- [ ] Renseigner couple_photo_1 / couple_photo_2 dans Paramètres (chemin /uploads/[slug]/…)
- [ ] ✅ Les photos sont **visibles immédiatement** — plus de restart *(réparé sprint P0-4)*
- [ ] Vérifier chaque photo sur la page publique (clic droit → afficher l'image)

## 7. INVITÉS
- [ ] Onglet **Invités** → ajouter chaque invité (prénom, nom, type : individuel/couple/famille, catégorie : VIP/FAMILLE/AMIS/SPONSORS/COLLEGUES, sièges)
- [ ] Ou **import en masse** (CSV/DOCX) si liste fournie
- [ ] Vérifier le code d'invitation généré automatiquement pour chaque invité
- [ ] Test : rechercher 2-3 invités par nom/filtre catégorie
- [ ] Si un **code d'accès** a été configuré : vérifier que la recherche exige ce code côté public *(P1-4)*

## 8. TABLES
- [ ] Onglet **Tables** → créer les tables (nom + numéro + capacité)
- [ ] Affecter les invités aux tables
- [ ] Vérifier l'occupation (sièges vs capacité)

## 9. RSVP
- [ ] Vérifier rsvp_deadline dans Paramètres
- [ ] Test réel : ouvrir une invitation invitée → répondre « Oui » avec message → vérifier côté admin
- [ ] Test réel : un « Non » → vérifier le statut DECLINED côté admin
- [ ] ⚠️ Pas de statut « Peut-être » disponible (Oui/Non seulement)

## 10. QR / LIENS D'INVITATION
- [ ] Onglet **Invitations** → générer les invitations (individuel : OK)
- [ ] ✅ Onglet QR Codes : le **téléchargement PNG est fonctionnel** (vrai PNG serveur, testé E2E) *(réparé sprint P0-5)* — download, PDF multi-pages et impression OK
- [ ] Alternative : copier le `invitationUrl` de chaque invité (format `/w/[slug]/?invite=[token]`)
- [ ] Test : ouvrir un lien copié dans une fenêtre privée → l'invité doit être authentifié
- [ ] ⚠️ Envoi en MASSE : nécessite le PAIEMENT du mariage (verrou commercial)

## 11. PREVIEW / VALIDATION
- [ ] Ouvrir la page publique en navigation privée : `https://wedding.hpph.net/w/[slug]`
- [ ] Vérifier : noms couple, date, lieu, photos, histoire, programme, section RSVP
- [ ] Vérifier sur mobile (téléphone réel de préférence)
- [ ] Faire valider la page par le client (envoi du lien en preview)

## 12. APPROBATION CLIENT
- [ ] Envoyer le lien de prévisualisation au client
- [ ] Recueillir les corrections (textes, photos, ordre du programme)
- [ ] Appliquer les corrections (propagation instantanée sur le site public)

## 13. PAIEMENT (avant envoi masse)
- [ ] Facturer le mariage (forfait) via le flux commercial
- [ ] Vérifier le statut commercial PAID/LIVE (sinon envoi masse bloqué 402)

## 14. PUBLICATION FINALE
- [ ] Confirmer le statut PUBLISHED du mariage
- [ ] Vérifier que le site est accessible publiquement sans connexion

## 15. LIVRAISON (ce qui est envoyé au client)
- [ ] **URL publique** : `https://wedding.hpph.net/w/[slug]` (à envoyer au couple)
- [ ] **Liens invités individuels** : invitationUrl par invité (WhatsApp/SMS)
- [ ] Identifiants organisateur (email + mot de passe) — UNIQUEMENT au couple/organisateur
- [ ] Si code d'accès activé : le communiquer aux invités avec l'invitation
- [ ] Instructions d'usage simples (modifier textes, voir RSVP)
- [ ] ❌ NE JAMAIS fournir : identifiants platform admin, accès serveur, secrets API

## 16. POST-LIVRAISON
- [ ] Surveiller les RSVP (onglet Invités + Statistiques)
- [ ] Modifications post-livraison : possibles à tout moment (propagation instantanée)
- [ ] Ne JAMAIS dépublier depuis l'organisateur (fonction platform admin uniquement — prévenir si besoin)
- [ ] Jour J : onglet Réception (check-in)

---

## Signaler un problème pendant la livraison
| Symptôme | Cause connue | Action |
|----------|--------------|--------|
| Formulaires vides dans l'admin | *(réparé P1-7)* — si réapparition | Se reconnecter ; vérifier le statut du mariage ; signaler |
| Bouton « Créer un mariage » → erreur 404 | *(réparé P0-1)* — si réapparition | Vérifier deploySha = HEAD git, sinon signaler infra |
| QR téléchargé illisible | *(réparé P0-5)* — si réapparition | Réessayer ?format=png, sinon copier l'invitationUrl |
| Envoi masse refusé (402) | Verrou commercial | Compléter le paiement |
| Photos cassées sur le public | *(réparé P0-4)* — si réapparition | Vérifier le container (restart inutile), signaler infra |
| Recherche invités refusée (code demandé) | Mariage protégé par code d'accès (P1-4) | Communiquer le code aux invités |
| Membre org non modifiable | *(faux positif audit — routes OK)* | Vérifier le rôle de l'utilisateur connecté |
| Reset password platform admin | Livraison du lien | Avec RESEND_API_KEY configuré : email automatique ; sinon extraire le resetUrl des logs (`docker logs wedding-app \| grep resetUrl`) |
