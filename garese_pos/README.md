# GARESE POS (`garese_pos`) — Odoo 17.0 — version 17.0.1.7.5

Écran de vente redessiné pour le Point de Vente Odoo 17 (Community et Enterprise).
Le module **étend** `point_of_sale` : sessions, mode hors ligne, paiements, tickets et
comptabilité restent ceux d'Odoo.

## Installation

1. Copier le dossier `garese_pos` dans le répertoire des addons personnalisés
   (ex. `/opt/odoo17/odoo17-custom-addons`), propriétaire `odoo17`.
2. Mettre à jour la liste des applications puis installer **GARESE POS**, ou :

   ```bash
   cd /tmp && sudo -u odoo17 /opt/odoo17/odoo17-venv/bin/python3 /opt/odoo17/odoo17/odoo-bin \
       -c /etc/odoo17.conf -d <BASE> -i garese_pos --stop-after-init --logfile=
   ```
3. Redémarrer le service Odoo, puis **ouvrir une session de caisse** : c'est le vrai test
   d'installation, les gabarits de l'écran de vente n'étant assemblés qu'à l'ouverture du POS.

Aucune dépendance Python ni module tiers. Seule dépendance Odoo : `point_of_sale`.

## Paramétrage

- **Point de Vente > Configuration > Paramètres > GARESE POS** (par point de vente) :
  affichage du stock, seuil de stock bas, délai d'actualisation, nombre de produits
  populaires et période, article « Sac », favoris réservés aux responsables.
- **Catégories de produits PdV** : couleur et icône (Font Awesome 4, ex. `fa-coffee`) de la tuile.
- **Fiche produit > onglet Ventes** : « Favori POS » (aussi modifiable depuis la caisse, étoile).
- **Modes de paiement** : icône et couleur de l'icône (ou image du mode de paiement, par exemple le
  logo de l'opérateur), « Demander une référence de transaction » (mobile money, virement, chèque).
- **Paramètres > GARESE POS > Écran de paiement** : montants rapides (billets) et touches « + » du pavé.
- **En-tête et pied du ticket** : réglages standard d'Odoo (logo et adresse de la société, pied de ticket).

## Ce que fait le module

| Zone | Fonction |
|---|---|
| Barre du haut | Nom du point de vente, recherche sur tout le catalogue, saisie manuelle d'un code, horloge, état de connexion, caissier et rôle |
| Panier | Photo, +/−, corbeille par ligne, compteur d'articles, « Vider », Remise / Sous-total / TVA / Total |
| Pavé | Client, boutons latéraux (Note au client, Devis/Commande si `pos_sale`), Paiement, pavé numérique, calculatrice |
| Catalogue | Tuiles Accueil / Tous / catégories colorées avec compteur, « Plus », sous-catégories, filtres Tous / Favoris / Promo / En stock, tri, vue grille ou liste |
| Produits | Badge de stock (vert / orange / rupture), étoile favori, repère « produit populaire », bouton + |
| Paiement | Modes de paiement avec icônes, montant à recevoir / monnaie à rendre, montants rapides, « Montant exact », touches « + » réglables, plusieurs paiements par commande, référence de transaction, récapitulatif de la commande, note au client |
| Reçu | « Paiement réussi », Imprimer, Envoyer par e-mail, Partager (image du ticket), Nouvelle vente |
| Ticket | Titre « Ticket de caisse », en-tête logo + adresse, n°, date, caisse, caissier, client, « Servi par », lignes Désignation / Qté / Prix unitaire / Prix total, Sous-total / Remise / Total en TTC (ligne TVA en option), paiements, référence, note |
| Serveur(se) | Liste des serveurs / serveuses, bouton de sélection sur la commande, nom imprimé sur le ticket, colonne, filtre et regroupement dans les commandes et l'analyse des ventes |
| Restaurant | Plan de salle redessiné : fourni par le module compagnon `garese_pos_restaurant`, installé automatiquement dès que l'application Restaurant (`pos_restaurant`) est présente |

## Points techniques

- Extensions ciblées des gabarits OWL (`t-inherit-mode="extension"`) : les ancrages utilisés
  par `pos_sale`, `pos_loyalty`, `pos_restaurant`, `pos_hr`... sont conservés.
- +/− et corbeille passent par `ProductScreen.updateSelectedOrderline` (même chemin que le
  pavé numérique) : les restrictions standard et celles des autres modules s'appliquent.
- Stock = quantité en stock dans l'emplacement source du point de vente, moins les ventes
  des sessions ouvertes dont les mouvements ne sont comptabilisés qu'à la clôture.
- Sur téléphone (`ui.isSmall`), l'écran standard d'Odoo est conservé.

## Mise à jour

Remplacer le dossier (et ajouter `garese_pos_restaurant` si le client utilise le mode Restaurant),
puis `-u garese_pos` et redémarrer le service. Aucune migration de données.

- **17.0.1.7.5** : avec « Masquer les commandes payées », la caissière voit les commandes payées de la session en cours
  (réimpression d'un ticket) ; les commandes des sessions précédentes restent masquées (contrôlé par le serveur).
- **17.0.1.7.4** : à la clôture, une fois le mot de passe du responsable saisi, le solde attendu, les écarts, le chiffre
  d'affaires et le rapport de ventes du jour s'affichent ; sans mot de passe ils restent masqués.
- **17.0.1.7.3** : avec la sélection du caissier (pos_hr), la caisse se fie à l'utilisateur Odoo connecté (comme le serveur)
  pour savoir s'il est responsable : le mot de passe du responsable est bien demandé à la clôture.
- **17.0.1.7.2** : vérification du mot de passe du responsable isolée (`_gp_verify_manager`) et fenêtre réutilisable
  par d'autres modules (`garese_pos_approval`).
- **17.0.1.7.1** : tableau de bord : les boutons d'une caisse (Modifier, session de secours) ne plantent plus quand
  l'action renvoyée n'a pas de liste de vues.
- **17.0.1.7.0** : **restrictions des caissiers** (Paramètres du point de vente > bloc « Restrictions des
  caissiers », par point de vente) : (1) clôture autorisée par un responsable — le caissier doit faire saisir
  par un responsable son mot de passe Odoo (valable 10 min) ; le responsable est enregistré sur la session et
  dans son suivi ; contrôlé côté serveur (impossible à contourner depuis la caisse) ; (2) commandes payées
  masquées (le caissier garde ses commandes en cours ; le filtre « Payé » demande le mot de passe) ;
  (3) totaux masqués à la clôture (le caissier compte seulement l'argent) et bouton rapport de ventes retiré ;
  (4) case « Caisse seule » sur la fiche utilisateur : arrivée directe sur la caisse, plus de menu Odoo,
  bouton Backend retiré. Responsables et administrateurs non concernés.
- **17.0.1.6.0** : nouveau **tableau de bord** (menu Point de vente > Tableau de bord) : chiffre d'affaires,
  tickets, panier moyen et clients servis avec variation vs période précédente, courbe des ventes, modes de
  paiement, ventes par catégorie, produits les plus vendus, ventes par caisse, dernières transactions et activité
  en temps réel (actualisation 30 s, bouton pause). Périodes : aujourd'hui, hier, 7 et 30 jours ; filtre par caisse.
  Les cartes de caisses gardent tous les détails du tableau de bord Odoo (ouvrir/continuer/fermer, contrôle
  d'ouverture/clôture, « À fermer », dernière clôture et solde, sessions de secours, utilisateur, menu
  Commandes/Sessions/Analyse/Modifier). Les caissiers (sans droit responsable) ne voient que les caisses, pas les
  montants. L'ancien tableau reste accessible : « Tableau de bord classique ».
- **17.0.1.5.0** : écran moins lumineux pour les caissières. Nouveau réglage « Ambiance de l'écran »
  (Claire = ancien look blanc, **Douce** = défaut, Tamisée). Fonds blancs remplacés par un gris-bleu
  apaisant sur toutes les pages (vente, paiement, tickets, fenêtres, clients) et plan de salle
  (`garese_pos_restaurant` 17.0.1.2.0) sur fond vert-gris. Les tickets imprimés restent noir sur blanc.
  Mise à jour : remplacer le dossier puis `-u garese_pos,garese_pos_restaurant`, Ctrl+F5 sur la caisse.
- **17.0.1.4.0** : texte des tickets plus grand. Nouveau réglage « Taille du texte des tickets »
  (Normale / Grande / Très grande, « Grande » par défaut) appliqué au ticket de caisse, à l'addition
  et au bon de préparation. La largeur du papier ne change pas : une désignation trop longue passe
  seule sur une ligne, et Qté / Prix unitaire / Prix total sur la ligne suivante, alignés sous leurs
  titres. En Grande et Très grande, le logo passe au-dessus des coordonnées de la société.
  L'aperçu à l'écran a désormais les mêmes proportions que le ticket imprimé.
- **17.0.1.3.1** : le nom du serveur ou de la serveuse est aussi imprimé sur le bon de préparation
  envoyé en cuisine / au bar (« Servi par : … », sous la salle et la table), y compris sur les bons
  d'annulation.
- **17.0.1.3.0** : la ligne TVA n'apparaît plus sur le ticket (Sous-total, Remise et Total en TTC) ;
  option « TVA sur le ticket » pour la réafficher. Suivi par serveur(se) : option
  « Serveur(se) sur les commandes » (et « Obligatoire avant le paiement »), liste dans
  Point de Vente > Configuration > Serveurs / Serveuses. Après avoir modifié la liste, recharger
  le point de vente.
- **17.0.1.2.0** : ticket intitulé « Ticket de caisse », colonnes Désignation / Qté / Prix unitaire /
  Prix total ; recherche de la barre supérieure réutilisable par les autres écrans (plan de salle).
- **17.0.1.1.0** : écran de paiement, écran « Paiement réussi », nouveau ticket. Les montants rapides
  et les incréments par défaut (5 000 à 500 000 ; +10 000 / +20 000 / +50 000) sont appliqués aux
  points de vente existants et se modifient dans les paramètres.

Licence OPL-1 — © GARESE.
