# App client — Les Cimes du Val d'Allos

EDL · incident pendant séjour · satisfaction post-séjour · activités.
Stack : React/Vite + Supabase (EU) + Vercel. Accès client via QR fixe par appartement.

## Architecture
- **QR fixe** affiché dans chaque appartement → `app.com/a/{slug}`
- Le client s'**identifie** (nom + email + date d'arrivée + consentements) → token de session 24 h
- Aucune table n'est exposée au rôle anon : **tout passe par les Edge Functions** (service_role, côté serveur). Conforme à ta règle "jamais de policy anon".

## Déploiement (ordre)

1. **Supabase** (projet en région EU)
   1. SQL Editor → colle `supabase_schema.sql` → Run.
   2. Storage → crée un bucket **privé** `edl-photos`.
   3. Secrets des functions :
      ```
      supabase secrets set SESSION_SECRET="<chaîne aléatoire longue>"
      ```
      (Aucune clé d'envoi d'email : les alertes sont consultées dans le dashboard.)
   4. Déploie chaque function (`identify`, `submit-edl`, `edl-photo-url`, `report-incident`, `submit-midstay`, `submit-satisfaction`, `get-activites`, `purge`) à partir de `edge_functions.ts` (un fichier `index.ts` par function).
   5. Cron quotidien sur `purge` (Database → Cron) pour la purge RGPD.

2. **Front**
   - Renseigne `FN` dans `src/App.jsx` (URL functions).
   - `npm create vite@latest` (React) → remplace `src/App.jsx` → `npm i` → deploy Vercel.

3. **QR codes** : génère un QR par appartement pointant vers `https://ton-app.vercel.app/a/{slug}`. Imprime-les.

## Modules
1. **État des lieux** — entrée/sortie, par pièce, signature, photos (à finaliser).
2. **Un souci ?** — signalement libre à tout moment → apparaît dans le dashboard (onglet Incidents, badge de compteur).
3. **Mi-séjour** — enquête courte (logement / équipements / propreté en Oui-Non). **Tout "Non" crée un incident** visible dans le dashboard pour correction immédiate.
4. **Satisfaction (post-séjour, 100% interne)** — 5 critères notés 1-5 (Accueil, Propreté, Équipements, Literie, Qualité-prix) + NPS + 2 verbatims. **Aucun routage vers avis public.**
5. **Activités** — liste éditoriale.

## Dashboard admin (`src/Admin.jsx`)
Auth via **Supabase Auth**. Un compte connecté n'accède aux données que s'il est listé dans la table `admins`.

Mise en place :
1. Supabase → Authentication → crée ton compte (email + mot de passe).
2. Récupère ton `user_id` (UUID) → `insert into admins (user_id, email) values ('<UUID>','<email>');`
3. Déploie les functions admin : `admin-dashboard`, `admin-list-apparts`, `admin-incident-update`, `admin-edl-photos`.
4. Front : installe `@supabase/supabase-js`, renseigne `SUPABASE_URL` + `SUPABASE_ANON` dans `Admin.jsx`, route `/admin` vers ce composant.

Contenu : KPIs (NPS, notes moyennes 1-5, incidents ouverts), détail par séjour (satisfaction + mi-séjour), **consultation des photos EDL** (URLs signées 1 h), gestion des incidents (changement de statut), filtres par appartement et par date.

**Alertes sans plateforme externe** : le dashboard est le centre de pilotage. Il se rafraîchit automatiquement toutes les 45 s tant qu'il est ouvert, et l'onglet Incidents affiche un badge rouge avec le nombre d'incidents non traités (statut « nouveau »). Un bouton « ↻ Rafraîchir » permet aussi une mise à jour manuelle. Marquer un incident « en cours » ou « résolu » le retire du compteur.

## Photos d'état des lieux
- Bucket Supabase **privé** `edl-photos` obligatoire.
- Côté client : compression automatique (max 1280 px, qualité 0.7) AVANT upload → ~200-400 Ko/photo.
- Upload direct dans le Storage via **URL signée** (la photo ne passe pas par l'Edge Function).
- Le client ajoute ses photos par pièce après avoir validé l'EDL (l'edl_id est alors connu).
- L'admin les consulte via URLs de lecture signées (expirent en 1 h).
- Functions concernées : `edl-photo-url` (upload), `admin-edl-photos` (lecture).

⚠️ La clé `anon` dans `Admin.jsx` ne donne accès à **rien** (RLS tout fermé) : elle ne sert qu'au login. Toutes les données transitent par les functions admin qui revérifient le rôle. Ne mets jamais la `service_role` dans le front.

## Dépendances front
- App client : React/Vite, aucune dépendance externe.
- Dashboard : `npm i @supabase/supabase-js`

## Décisions actées
- Pas de PDF : tout en base.
- Identification : nom + date d'arrivée + email.
- Activités : liste éditoriale.
- Mid-stay : réponse négative = incident + alerte.
- Post-séjour : interne uniquement, critères 1-5 + NPS, pas d'avis Google.

## RGPD — déjà câblé
- Consentements séparés (séjour vs marketing).
- `purge_after` = checkout + 13 mois, purge automatisable.
- Bucket photos privé, suppression incluse dans la purge.
- ⚠️ À fournir toi-même : page `/confidentialite` (mentions, finalités, durée, droits).

## Limites à assumer (honnêteté)
- Identification = preuve faible (nom + date + email connus = accès possible). Proportionné pour de la location saisonnière, pas plus.
- Signature dessinée = commencement de preuve, **pas** signature eIDAS qualifiée.
- Enquêtes 100% internes : pense à analyser les notes par appartement et dans le temps (le schéma le permet via `appartement_id` sur les séjours).

## Coûts
- Supabase Storage : gratuit < 1 Go. **Compression photo côté client obligatoire** (à brancher sur le bouton photo de l'EDL).
- Aucune plateforme externe : alertes et réponses clients sont dans le dashboard. Le dashboard se rafraîchit tout seul (45 s) tant qu'il est ouvert.
- Upload photos : préfère les *signed URLs* au base64 si volume élevé.
