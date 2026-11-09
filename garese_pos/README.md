# GARESE POS (`garese_pos`) — Odoo 19.0 — version 19.0.1.0.0

## Version Odoo 19 (19.0.1.0.0)

Portage complet de la version 17.0.1.11.1 vers Odoo 19 (Community et Enterprise). Toutes les fonctions sont reprises :
accueil (promotions, produits populaires), tuiles de catégories, filtres, tri, vue grille / liste, cartes produits
(prix, promo, marque, stock, favoris), panier avec photos et +/−, totaux, calculatrice, fiche client, « souvent achetés
avec », objectif du jour, alerte de stock, serveurs, bouton Sac, saisie de code, raccourcis F2 / F4 / F6 et Alt+1..9,
écran de paiement en 3 colonnes (montants rapides, touches +, référence de transaction obligatoire), écran « Paiement
réussi » (impression, e-mail, partage), ticket redessiné, restrictions des caissiers (clôture par un responsable, totaux
masqués, commandes payées masquées, caisse seule), tableau de bord, thèmes, ambiance, animations et sons, écran de chargement.

Changements techniques liés à Odoo 19 : le point de vente charge les **modèles de produits** (product.template) et non
plus les variantes ; les données passent par `_load_pos_data_*` ; la note client et le serveur de la commande sont
synchronisés nativement (champs de pos.order) ; les fenêtres utilisent le service `dialog` ; la monnaie à rendre est
toujours imprimée en positif sur le ticket GARESE. Les noms de champs sont identiques à la version 17 : les données
(marques, serveurs, favoris, réglages) sont conservées lors de la migration de la base.


Écran de vente redessiné pour le Point de Vente Odoo 19 (Community et Enterprise).
Le module **étend** `point_of_sale` : sessions, mode hors ligne, paiements, tickets et
comptabilité restent ceux d'Odoo.

- **17.0.1.11.1** : cartes produit : l'ancien prix passe sur sa propre ligne, les prix en FCFA ne sont plus tronqués. `garese_pos_hr` 17.0.1.0.1 : jusqu'à 5 cartes de caissières sur une ligne.

## Nouveautés 1.11.0 — Écran de chargement

L'écran de démarrage du Point de vente est remplacé par une carte GARESE POS : logo animé, barre de chargement fluide et messages qui défilent (« Préparation de votre caisse… », « Chargement des produits et des prix… »). La barre est indéterminée (Odoo ne fournit pas de pourcentage réel). Animations coupées si « réduire les animations » est activé. La carte « Objectif atteint » utilise « restant » au lieu de « gauche » en français.
Le choix des caissières (connexion Employés) est fourni par le module séparé `garese_pos_hr`.

## Nouveautés 1.9.0 — Marque des produits (optionnelle)

- **Point de Vente > Configuration > Paramètres > GARESE POS > Marques des produits** : active le champ
  **Marque** sur la fiche produit et le menu **Point de Vente > Configuration > Marques** (modèle `gp.brand`).
- Option par point de vente **« Afficher la marque dans ce point de vente »** : la marque s'affiche au-dessus du nom
  sur les cartes produit, et la recherche en caisse trouve aussi les produits par marque.
- Back-office : colonne optionnelle, filtre de recherche et regroupement par marque sur les produits.
- Les variantes restent à utiliser pour taille/couleur ; la marque est un champ du produit.

## Nouveautés 1.10.0 — Point de vente interactif

Réglages dans **Point de vente > Configuration > Paramètres > GARESE POS > Point de vente interactif** (par point de vente) :

- **Animations** (activées par défaut) : le produit s'envole de sa tuile vers le panier, la ligne ajoutée clignote en vert, les compteurs pulsent, l'écran « Paiement réussi » affiche une coche animée et le montant de monnaie à rendre. Respecte « réduire les animations » du système.
- **Sons** (désactivés par défaut) : sons discrets à l'ajout, au paiement réussi, en cas d'erreur et à l'objectif atteint (générés par le navigateur, aucun fichier).
- **Souvent achetés avec** (activé) : sous le panier, 3 produits les plus souvent vendus dans la même commande que le produit sélectionné (90 derniers jours de la caisse, méthode `pos.config.gp_affinity`).
- **Fiche client** (activée) : sous le titre du panier, total dépensé, nombre de visites, dernière visite, repère VIP (« VIP à partir de », 0 = désactivé), anniversaire (nouveau champ **Anniversaire** sur la fiche contact), produits habituels en un clic, et barre de progression de récompense (« Récompense tous les N achats » + texte ; informatif, n'applique pas de remise). Bouton **Récents** (touche F6) : clients des dernières ventes.
- **Objectif du jour** : barre de progression sur l'accueil, actualisée après chaque vente ; son et message à l'objectif atteint.
- **Alerte de stock** : notification quand un produit ajouté passe sous le seuil de stock bas ou est épuisé (avec « Afficher le stock »).
- **Classement des serveurs** dans le tableau de bord (ventes de la période).
- **Thème de couleur** (Violet, Vert, Bleu, Orange, Rose), **taille des tuiles** (compacte, normale, grande) et **logo** de la barre du haut, par point de vente.
- **Raccourcis clavier** : F2 recherche, F4 paiement, F6 clients récents ; sur l'écran de paiement Alt+1 à Alt+9 pour les modes de paiement.
- **Recherche** : les accents sont ignorés ; si rien n'est trouvé, une faute de frappe d'une lettre par mot est tolérée.
- **Tablettes** : l'interface GARESE s'affiche dès 768 px de large (paysage). En portrait et sur téléphone, l'écran mobile d'Odoo est conservé, avec la marque, la promotion et le stock sur les cartes.
- Le module `garese_pos_restaurant` passe en 17.0.1.2.1 (couleur principale suivie du thème).

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

- **17.0.1.9.0** : promotions. Les produits vendus sous leur prix public par la liste de prix (dates de début et de fin de la
  liste de prix = période de la promotion) affichent un badge « -X % » et l'ancien prix barré, et forment la section
  « Promotions », affichée en premier sur l'accueil à chaque ouverture de la caisse (réglage « Promotions en premier »,
  activé par défaut). Le badge « -X % » apparaît aussi sur la ligne du panier, et le ticket indique « Promo -X % (ancien prix) »
  sous l'article. Activer les listes de prix dans le Point de Vente et y ajouter la liste de la promotion.
  La liste de prix est lue à l'ouverture de la session : une promotion créée en cours de journée apparaît à la
  réouverture de la caisse. Aucune migration de données.
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
