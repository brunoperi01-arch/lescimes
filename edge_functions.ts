// =====================================================================
// EDGE FUNCTIONS Supabase (Deno) — toutes utilisent SERVICE_ROLE (serveur)
// Déploie chaque bloc comme une function distincte :
//   supabase functions deploy identify
//   supabase functions deploy submit-edl
//   supabase functions deploy report-incident
//   supabase functions deploy submit-midstay
//   supabase functions deploy submit-satisfaction
//   supabase functions deploy get-activites
//   supabase functions deploy purge
// Variables d'env requises (secrets) : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optionnel : SESSION_SECRET (signature token)
// Aucune plateforme externe : les alertes et réponses clients sont consultées
// directement dans le dashboard admin.
// =====================================================================

// ---------- _shared/cors.ts ----------
export const cors = {
  "Access-Control-Allow-Origin": "*", // restreins à ton domaine Vercel en prod
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// ---------- _shared/client.ts ----------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
export const admin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // jamais exposée au client
  );

// ---------- _shared/token.ts ----------
// Token de session court signé (HMAC). Pas de JWT lourd : suffisant ici.
const enc = new TextEncoder();
async function hmac(data: string) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(Deno.env.get("SESSION_SECRET") ?? "change-me"),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
export async function makeToken(sejourId: string) {
  const exp = Date.now() + 24 * 3600 * 1000; // 24h
  const payload = `${sejourId}.${exp}`;
  return `${payload}.${await hmac(payload)}`;
}
export async function verifyToken(token: string): Promise<string | null> {
  const [sejourId, exp, sig] = (token ?? "").split(".");
  if (!sejourId || !exp) return null;
  if (Date.now() > Number(exp)) return null;
  if ((await hmac(`${sejourId}.${exp}`)) !== sig) return null;
  return sejourId;
}

// =====================================================================
// FUNCTION 1 : identify
// QR -> page -> client saisit nom + date arrivée + email + consentements
// Valide le couple contre un séjour ACTIF pour cet appartement, renvoie un token.
// =====================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { slug, nom, email, date_arrivee, consent_rgpd, consent_marketing } =
      await req.json();

    if (!consent_rgpd) {
      return json({ error: "Consentement RGPD requis." }, 400);
    }

    const db = admin();
    const { data: appart } = await db.from("appartements")
      .select("id").eq("slug", slug).eq("actif", true).single();
    if (!appart) return json({ error: "Appartement inconnu." }, 404);

    // Match insensible à la casse sur email + nom + date d'arrivée
    const { data: sejour } = await db.from("sejours")
      .select("id, consent_marketing")
      .eq("appartement_id", appart.id)
      .eq("date_arrivee", date_arrivee)
      .ilike("email", email.trim())
      .ilike("nom_client", `%${nom.trim()}%`)
      .maybeSingle();

    if (!sejour) return json({ error: "Séjour introuvable. Vérifiez vos informations." }, 404);

    // Met à jour le consentement marketing si nouvellement donné
    if (consent_marketing && !sejour.consent_marketing) {
      await db.from("sejours").update({ consent_marketing: true }).eq("id", sejour.id);
    }

    const token = await makeToken(sejour.id);
    return json({ token });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

// =====================================================================
// FUNCTION 2 : submit-edl
// Reçoit token + type + rempli_par + pièces + signature.
// Les photos sont uploadées séparément via signed URL (voir note ci-dessous).
// =====================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { token, type, rempli_par, signature, commentaire_general, pieces } =
    await req.json();
  const sejourId = await verifyToken(token);
  if (!sejourId) return json({ error: "Session invalide ou expirée." }, 401);

  const db = admin();
  const { data: edl, error } = await db.from("edl").insert({
    sejour_id: sejourId, type, rempli_par, signature, commentaire_general,
  }).select("id").single();
  if (error) return json({ error: error.message }, 500);

  if (Array.isArray(pieces) && pieces.length) {
    await db.from("edl_pieces").insert(
      pieces.map((p: any) => ({
        edl_id: edl.id, piece: p.piece, etat: p.etat, commentaire: p.commentaire,
      })),
    );
  }
  // Renvoie l'edl_id pour rattacher les photos ensuite
  return json({ ok: true, edl_id: edl.id });
});

// Upload photo : le front demande une signed upload URL puis poste le fichier.
// Variante simple : poster le base64 ici et faire db.storage.upload côté serveur.
// (À éviter pour de gros volumes -> préférer signed URL. Compression front obligatoire.)

// =====================================================================
// FUNCTION 2b : edl-photo-url  (génère une URL d'upload signée)
// Body : { token, edl_id, piece, ext }
// Renvoie une signed upload URL vers le bucket privé 'edl-photos'.
// =====================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { token, edl_id, piece, ext } = await req.json();
  const sejourId = await verifyToken(token);
  if (!sejourId) return json({ error: "Session invalide." }, 401);

  const db = admin();
  // Vérifie que l'edl appartient bien au séjour du token (anti-falsification)
  const { data: edl } = await db.from("edl").select("id").eq("id", edl_id).eq("sejour_id", sejourId).maybeSingle();
  if (!edl) return json({ error: "EDL invalide." }, 403);

  const safeExt = (ext || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 5);
  const path = `${sejourId}/${edl_id}/${crypto.randomUUID()}.${safeExt}`;
  const { data, error } = await db.storage.from("edl-photos").createSignedUploadUrl(path);
  if (error) return json({ error: error.message }, 500);

  // Enregistre le chemin attendu (la ligne existe avant l'upload effectif)
  await db.from("edl_photos").insert({ edl_id, piece, storage_path: path });
  return json({ signedUrl: data.signedUrl, token: data.token, path });
});

// =====================================================================
// FUNCTION 3 : report-incident  (PENDANT le séjour)
// Enregistre l'incident ; il apparaît dans le dashboard admin (onglet Incidents).
// =====================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { token, categorie, message } = await req.json();
  const sejourId = await verifyToken(token);
  if (!sejourId) return json({ error: "Session invalide." }, 401);

  const db = admin();
  await db.from("incidents").insert({ sejour_id: sejourId, categorie, message });
  // Pas d'envoi externe : l'incident apparaît dans le dashboard admin (onglet Incidents).
  return json({ ok: true });
});

// =====================================================================
// FUNCTION 4a : submit-midstay  (PENDANT le séjour, enquête courte)
// Chaque "false" = problème -> crée un incident (visible dans le dashboard).
// =====================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { token, logement_ok, equipements_ok, proprete_ok, commentaire } =
    await req.json();
  const sejourId = await verifyToken(token);
  if (!sejourId) return json({ error: "Session invalide." }, 401);

  const db = admin();
  await db.from("midstay").insert({
    sejour_id: sejourId, logement_ok, equipements_ok, proprete_ok, commentaire,
  });

  // Détecte les KO et crée un incident par problème
  const ko = [
    [logement_ok, "Logement"],
    [equipements_ok, "Équipement"],
    [proprete_ok, "Propreté"],
  ].filter(([ok]) => ok === false).map(([, cat]) => cat as string);

  if (ko.length) {
    await db.from("incidents").insert(
      ko.map((categorie) => ({
        sejour_id: sejourId, categorie,
        message: `[Mid-stay] Insatisfaction signalée : ${categorie}. ${commentaire ?? ""}`.trim(),
      })),
    );
    // Les incidents créés apparaissent dans le dashboard admin (onglet Incidents).
  }
  return json({ ok: true, alertes: ko.length });
});

// =====================================================================
// FUNCTION 4b : submit-satisfaction  (POST-séjour, 100% INTERNE)
// Critères 1-5 + NPS + verbatim. AUCUN routage avis public.
// =====================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const {
    token, note_accueil, note_proprete, note_equipements, note_literie,
    note_qualite_prix, nps, point_positif, point_amelioration,
  } = await req.json();
  const sejourId = await verifyToken(token);
  if (!sejourId) return json({ error: "Session invalide." }, 401);

  const db = admin();
  const { error } = await db.from("satisfaction").insert({
    sejour_id: sejourId, note_accueil, note_proprete, note_equipements,
    note_literie, note_qualite_prix, nps, point_positif, point_amelioration,
  });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});

// =====================================================================
// FUNCTION 5 : get-activites  (lecture publique des activités actives)
// =====================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const { data } = await db.from("activites")
    .select("titre, description, categorie, image_url, lien")
    .eq("actif", true).order("ordre");
  return json({ activites: data ?? [] });
});

// =====================================================================
// FUNCTION 6 : purge  (RGPD — à déclencher via cron quotidien Supabase)
// Supprime les séjours échus + leurs fichiers Storage.
// =====================================================================
Deno.serve(async () => {
  const db = admin();
  // Récupère les chemins de photos à supprimer du Storage avant cascade
  const { data: echus } = await db.from("sejours")
    .select("id").lt("purge_after", new Date().toISOString().slice(0, 10));
  if (echus?.length) {
    const ids = echus.map((s) => s.id);
    const { data: edls } = await db.from("edl").select("id").in("sejour_id", ids);
    const edlIds = (edls ?? []).map((e) => e.id);
    if (edlIds.length) {
      const { data: photos } = await db.from("edl_photos")
        .select("storage_path").in("edl_id", edlIds);
      const paths = (photos ?? []).map((p) => p.storage_path);
      if (paths.length) await db.storage.from("edl-photos").remove(paths);
    }
  }
  const { data: n } = await db.rpc("purge_sejours_echus");
  return json({ purged: n });
});

// =====================================================================
// _shared/admin.ts — vérifie que l'appelant est un admin autorisé
// Le front envoie le JWT Supabase Auth dans l'en-tête Authorization.
// =====================================================================
export async function requireAdmin(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return null;
  const db = admin();
  // Valide le JWT et récupère l'utilisateur
  const { data: { user }, error } = await db.auth.getUser(auth);
  if (error || !user) return null;
  // Vérifie qu'il est dans la table admins
  const { data: a } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return a ? user.id : null;
}

// =====================================================================
// FUNCTION 7 : admin-dashboard  (KPIs + détail + filtre appartement)
// Body optionnel : { appartement_id, depuis (date) }
// =====================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await requireAdmin(req))) return json({ error: "Accès refusé." }, 403);

  const { appartement_id, depuis } = await req.json().catch(() => ({}));
  const db = admin();

  // Séjours filtrés (sert de socle pour relier les enquêtes aux apparts)
  let sq = db.from("sejours").select("id, nom_client, email, date_arrivee, date_depart, appartement_id, appartements(nom)");
  if (appartement_id) sq = sq.eq("appartement_id", appartement_id);
  if (depuis) sq = sq.gte("date_arrivee", depuis);
  const { data: sejours } = await sq;
  const sejourIds = (sejours ?? []).map((s) => s.id);
  const apMap = Object.fromEntries((sejours ?? []).map((s) => [s.id, { nom: s.nom_client, appart: s.appartements?.nom }]));

  const inIds = (q: any) => sejourIds.length ? q.in("sejour_id", sejourIds) : q.in("sejour_id", ["00000000-0000-0000-0000-000000000000"]);

  // Satisfaction post-séjour
  const { data: satis } = await inIds(db.from("satisfaction").select("*"));
  // Mid-stay
  const { data: mid } = await inIds(db.from("midstay").select("*"));
  // Incidents (ouverts en priorité)
  const { data: incidents } = await inIds(db.from("incidents").select("*").order("created_at", { ascending: false }));

  // --- KPIs satisfaction ---
  const avg = (arr: any[], k: string) => {
    const v = arr.map((x) => x[k]).filter((n) => n != null);
    return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null;
  };
  const npsScore = (() => {
    const v = (satis ?? []).map((s) => s.nps).filter((n) => n != null);
    if (!v.length) return null;
    const prom = v.filter((n) => n >= 9).length, det = v.filter((n) => n <= 6).length;
    return Math.round(((prom - det) / v.length) * 100); // NPS classique -100..+100
  })();

  const kpis = {
    nb_reponses: (satis ?? []).length,
    nps: npsScore,
    note_accueil: avg(satis ?? [], "note_accueil"),
    note_proprete: avg(satis ?? [], "note_proprete"),
    note_equipements: avg(satis ?? [], "note_equipements"),
    note_literie: avg(satis ?? [], "note_literie"),
    note_qualite_prix: avg(satis ?? [], "note_qualite_prix"),
    incidents_ouverts: (incidents ?? []).filter((i) => i.statut !== "resolu").length,
    incidents_total: (incidents ?? []).length,
  };

  // Enrichit le détail avec nom client + appart
  const enrich = (rows: any[]) => (rows ?? []).map((r) => ({ ...r, _client: apMap[r.sejour_id]?.nom, _appart: apMap[r.sejour_id]?.appart }));

  return json({
    kpis,
    satisfaction: enrich(satis ?? []),
    midstay: enrich(mid ?? []),
    incidents: enrich(incidents ?? []),
  });
});

// =====================================================================
// FUNCTION 8 : admin-list-apparts  (pour le filtre)
// =====================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await requireAdmin(req))) return json({ error: "Accès refusé." }, 403);
  const db = admin();
  const { data } = await db.from("appartements").select("id, nom").eq("actif", true).order("nom");
  return json({ appartements: data ?? [] });
});

// =====================================================================
// FUNCTION 9 : admin-incident-update  (changer le statut)
// Body : { incident_id, statut }
// =====================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await requireAdmin(req))) return json({ error: "Accès refusé." }, 403);
  const { incident_id, statut } = await req.json();
  if (!["nouveau", "en_cours", "resolu"].includes(statut)) return json({ error: "Statut invalide." }, 400);
  const db = admin();
  const { error } = await db.from("incidents").update({ statut }).eq("id", incident_id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});

// =====================================================================
// FUNCTION 10 : admin-edl-photos  (URLs de lecture signées pour un séjour)
// Body : { sejour_id }
// =====================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await requireAdmin(req))) return json({ error: "Accès refusé." }, 403);
  const { sejour_id } = await req.json();
  const db = admin();
  const { data: edls } = await db.from("edl").select("id, type").eq("sejour_id", sejour_id);
  const edlIds = (edls ?? []).map((e) => e.id);
  if (!edlIds.length) return json({ photos: [] });
  const { data: photos } = await db.from("edl_photos").select("storage_path, piece, edl_id").in("edl_id", edlIds);
  const typeByEdl = Object.fromEntries((edls ?? []).map((e) => [e.id, e.type]));
  const out = [];
  for (const p of photos ?? []) {
    const { data: signed } = await db.storage.from("edl-photos").createSignedUrl(p.storage_path, 3600);
    if (signed) out.push({ url: signed.signedUrl, piece: p.piece, type: typeByEdl[p.edl_id] });
  }
  return json({ photos: out });
});

// ---------- helper ----------
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "content-type": "application/json" },
  });
}
