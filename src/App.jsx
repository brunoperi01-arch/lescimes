import { useState, useEffect, useRef } from "react";

// =====================================================================
// CONFIG — renseigne l'URL de tes Edge Functions Supabase
// =====================================================================
const FN = "https://wmwxgrhlcqluzejdolje.supabase.co/functions/v1";
const post = async (name, body) => {
  try {
    const r = await fetch(`${FN}/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    // Si la réponse n'est pas du JSON (ex. erreur 500 HTML, fonction absente)
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch { return { error: `Réponse inattendue du serveur (HTTP ${r.status}). Vérifiez que la fonction « ${name} » est déployée et que l'URL Supabase est correcte.` }; }
    if (!r.ok && !data.error) return { error: `Erreur serveur (HTTP ${r.status}).` };
    return data;
  } catch (e) {
    // Erreur réseau / CORS / URL injoignable
    return { error: `Connexion impossible au serveur. Vérifiez l'URL Supabase (FN) et le déploiement de la fonction. Détail : ${e.message}` };
  }
};

// Thème Glacier (identique à la landing : #0f5b6b, accent orangé #f2a65a)
const C = {
  blue: "#0f5b6b", blueDk: "#0a4350", blue2: "#13708a", gold: "#f2a65a", goldDk: "#d98736",
  bg: "#f1f6f7", card: "#ffffff", text: "#13343b", muted: "#5d7a81",
  line: "#dceaed", bad: "#d9534f", ok: "#3fa34d",
};

// Photos EDL en standby : passe à true pour réactiver l'étape photos
// (utile "en cas de problème" pour documenter l'état d'un logement).
const PHOTOS_EDL = false;

const PIECES_DEFAUT = ["Séjour", "Cuisine", "Chambre 1", "Chambre 2", "Salle de bain", "WC", "Extérieur/Balcon"];

// Polices de la landing : Archivo Black (titres) + Plus Jakarta Sans (texte)
const FONT_TITLE = "'Archivo Black',sans-serif";
const FONT_BODY = "'Plus Jakarta Sans',system-ui,sans-serif";
function useGlacierFonts() {
  useEffect(() => {
    if (document.getElementById("glacier-fonts")) return;
    const l = document.createElement("link");
    l.id = "glacier-fonts"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";
    document.head.appendChild(l);
  }, []);
}

// =====================================================================
// PERSISTANCE DE L'ACCÈS CLIENT
// Le token est un jeton opaque signé HMAC : sejourId.exp.signature.
// On ne stocke QUE ce jeton (jamais nom/email/date en clair) -> RGPD OK.
// On lit l'expiration directement dans le jeton (pas d'appel serveur).
// =====================================================================
const TOKEN_KEY = "cimes_session_token";
function tokenValide(t) {
  const parts = (t || "").split(".");
  if (parts.length < 3) return false;
  const exp = Number(parts[1]);
  return !!exp && Date.now() < exp;
}
// Token éventuellement transmis par un lien de relance : /?token=XXX
function tokenDepuisURL() {
  try {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("token");
    return tokenValide(t) ? t : null;
  } catch { return null; }
}

export default function App() {
  useGlacierFonts();
  // Un lien de relance (?token=…) pré-identifie le client et ouvre la satisfaction.
  const [depuisRelance] = useState(() => !!tokenDepuisURL());
  const [token, setToken] = useState(() => {
    try {
      const urlTok = tokenDepuisURL();
      if (urlTok) {
        try { localStorage.setItem(TOKEN_KEY, urlTok); } catch {}
        // On nettoie l'URL pour ne pas laisser traîner le token dans la barre d'adresse
        try { window.history.replaceState({}, document.title, window.location.pathname); } catch {}
        return urlTok;
      }
      const t = localStorage.getItem(TOKEN_KEY);
      if (tokenValide(t)) return t;
      localStorage.removeItem(TOKEN_KEY); // jeton périmé ou corrompu -> on nettoie
      return null;
    } catch { return null; }
  });
  const [tab, setTab] = useState(depuisRelance ? "satis" : "edl");

  // Statut serveur des modules déjà enregistrés pour ce séjour.
  // null = en cours de chargement (on affiche un loader, pas le formulaire)
  // {}   = endpoint absent/en erreur -> dégradé gracieux : rien n'est verrouillé
  // {edl:{entree,sortie}, midstay, satisfaction} = valeurs = date ISO (ou null)
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!token) { setStatus(null); return; }
    let annule = false;
    post("sejour-status", { token }).then((r) => {
      if (annule) return;
      setStatus(r && !r.error ? r : {}); // pas de verrou si le serveur ne répond pas
    });
    return () => { annule = true; };
  }, [token]);

  // Marque un module comme enregistré localement après une soumission réussie,
  // pour verrouiller immédiatement sans ré-interroger le serveur.
  const markDone = (mod, type) => setStatus((s) => {
    const next = { ...(s || {}) };
    const now = new Date().toISOString();
    if (mod === "edl") next.edl = { ...(next.edl || {}), [type]: now };
    else next[mod] = now;
    return next;
  });

  const handleAuth = (t) => {
    try { localStorage.setItem(TOKEN_KEY, t); } catch {}
    setToken(t);
  };
  const handleLogout = () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    setToken(null);
  };

  if (!token) return <Identify onAuth={handleAuth} />;

  const chargement = status === null;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", color: C.text }}>
      <header style={{ background: C.blueDk, color: "#fff", padding: "18px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontFamily: FONT_TITLE, fontSize: 18, letterSpacing: "-.3px" }}>Les Cimes du Val d'Allos</div>
          <div style={{ opacity: .85, fontSize: 13 }}>Espace client de votre séjour</div>
        </div>
        <button onClick={handleLogout}
          style={{ background: "none", border: "1px solid rgba(255,255,255,.4)", color: "#fff", borderRadius: 8, padding: "7px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
          Changer de séjour
        </button>
      </header>

      <nav style={{ display: "flex", background: C.card, borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, zIndex: 5, overflowX: "auto" }}>
        {[["edl", "État des lieux"], ["rdv", "RDV départ"], ["incident", "Un souci ?"], ["midstay", "Mi-séjour"], ["satis", "Satisfaction"], ["activites", "Offres"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ flex: "1 0 auto", padding: "12px 10px", border: 0, background: "none", cursor: "pointer", whiteSpace: "nowrap",
              fontWeight: tab === k ? 800 : 500, color: tab === k ? C.blue : C.muted,
              borderBottom: tab === k ? `3px solid ${C.blue}` : "3px solid transparent", fontSize: 13 }}>
            {l}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: 16 }}>
        {tab === "edl" && <EDL token={token} statusEdl={status?.edl} loading={chargement} onDone={(t) => markDone("edl", t)} onGoSatis={() => setTab("satis")} />}
        {tab === "rdv" && <RdvDepart token={token} />}
        {tab === "incident" && <Incident token={token} />}
        {tab === "midstay" && <MidStay token={token} dejaFait={status?.midstay} loading={chargement} onDone={() => markDone("midstay")} />}
        {tab === "satis" && <Satisfaction token={token} dejaFait={status?.satisfaction} loading={chargement} onDone={() => markDone("satisfaction")} />}
        {tab === "activites" && <Activites />}
      </main>
    </div>
  );
}

// ---------- Carte UI ----------
const Card = ({ children, style }) => (
  <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, marginBottom: 14, ...style }}>{children}</div>
);
const btn = (bg = C.blue) => ({ background: bg, color: "#fff", border: 0, borderRadius: 10, padding: "13px 18px", fontWeight: 700, cursor: "pointer", width: "100%", fontSize: 15 });
const inp = { width: "100%", padding: "11px 12px", border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 15, boxSizing: "border-box", marginTop: 6 };
const label = { fontSize: 13, fontWeight: 700, color: C.muted };

// Petit loader pendant que le statut serveur arrive
const Chargement = () => <Card style={{ color: C.muted, textAlign: "center" }}>Chargement…</Card>;

// Carte "verrouillé" : module déjà enregistré, non modifiable
function VerrouCard({ titre, message, date }) {
  return (
    <Card style={{ textAlign: "center", padding: "30px 20px" }}>
      <div style={{ width: 60, height: 60, margin: "0 auto 14px", background: "#eef5f6", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <div style={{ fontSize: 16, fontFamily: FONT_TITLE, color: C.blueDk, letterSpacing: "-.3px" }}>{titre}</div>
      {message && <p style={{ fontSize: 14, color: C.muted, margin: "8px 0 0", lineHeight: 1.6 }}>{message}</p>}
      {date && <p style={{ fontSize: 12, color: C.muted, margin: "10px 0 0" }}>Enregistré le {new Date(date).toLocaleDateString("fr-FR")}</p>}
    </Card>
  );
}

// =====================================================================
// ÉCRAN 0 — IDENTIFICATION (après scan du QR)
// =====================================================================
function Identify({ onAuth }) {
  useGlacierFonts();
  const [f, setF] = useState({ nom: "", email: "", date_arrivee: "", date_depart: "" });
  const [apparts, setApparts] = useState(null);
  const [apId, setApId] = useState("");
  const [rgpd, setRgpd] = useState(false);
  const [mkt, setMkt] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // Charge la liste des appartements pour le menu déroulant
  useEffect(() => {
    post("list-apparts-public", {}).then((r) => setApparts(r.appartements || []));
  }, []);

  const submit = async () => {
    setErr(""); setLoading(true);
    if (!apId) {
      setLoading(false);
      setErr("Veuillez sélectionner votre appartement.");
      return;
    }
    const r = await post("identify", {
      appartement_id: apId, nom: f.nom, email: f.email,
      date_arrivee: f.date_arrivee, date_depart: f.date_depart,
      consent_rgpd: rgpd, consent_marketing: mkt,
    });
    setLoading(false);
    if (r.token) onAuth(r.token); else setErr(r.error || "Erreur inconnue.");
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "0 0 32px", fontFamily: FONT_BODY }}>
      <div style={{ maxWidth: 440, width: "100%" }}>
        <Hero titre="Bienvenue" sousTitre="Les Cimes du Val d'Allos" />
        <div style={{ padding: "0 16px", marginTop: -18 }}>
        <p style={{ color: C.muted, margin: "0 0 12px", fontSize: 14, textAlign: "center" }}>Renseignez votre séjour pour accéder à votre espace.</p>
        <Card>
          <label style={label}>Appartement <span style={{ color: C.bad }}>*</span>
            <select style={inp} value={apId} onChange={(e) => setApId(e.target.value)}>
              <option value="">— Sélectionnez votre appartement —</option>
              {(apparts || []).map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </label>
          {apparts && apparts.length === 0 && <p style={{ fontSize: 12, color: C.bad, margin: "6px 0 0" }}>Aucun appartement disponible. Contactez la résidence.</p>}
          <div style={{ height: 12 }} />
          <label style={label}>Nom<input style={inp} value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></label>
          <div style={{ height: 12 }} />
          <label style={label}>Email<input style={inp} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <div style={{ height: 12 }} />
          <label style={label}>Date d'arrivée<input style={inp} type="date" value={f.date_arrivee} onChange={(e) => setF({ ...f, date_arrivee: e.target.value })} /></label>
          <div style={{ height: 16 }} />
          <label style={{ display: "flex", gap: 8, fontSize: 13, color: C.text, alignItems: "flex-start" }}>
            <input type="checkbox" checked={rgpd} onChange={(e) => setRgpd(e.target.checked)} style={{ marginTop: 2, width: 22, height: 22, flexShrink: 0 }} />
            <span>J'accepte le traitement de mes données pour la gestion de mon séjour (<a href="/confidentialite" style={{ color: C.blue }}>politique de confidentialité</a>).</span>
          </label>
          <div style={{ height: 10 }} />
          <label style={{ display: "flex", gap: 8, fontSize: 13, color: C.text, alignItems: "flex-start" }}>
            <input type="checkbox" checked={mkt} onChange={(e) => setMkt(e.target.checked)} style={{ marginTop: 2, width: 22, height: 22, flexShrink: 0 }} />
            <span>J'accepte de recevoir les offres de la résidence (facultatif).</span>
          </label>
          {err && <p style={{ color: C.bad, fontSize: 14 }}>{err}</p>}
          <div style={{ height: 14 }} />
          <button style={btn()} disabled={loading || !rgpd || !apId || !f.nom.trim() || !f.email.trim() || !f.date_arrivee} onClick={submit}>
            {loading ? "Création de votre espace…" : "Accéder à mon espace"}
          </button>
        </Card>
        <InfosPratiques />
        <Vitrine />
        </div>
      </div>
    </div>
  );
}

// En-tête héros : bandeau teal avec icône cime (SVG inline, pas de dépendance)
function Hero({ titre, sousTitre }) {
  return (
    <div style={{ background: C.blue, padding: "26px 20px 34px", textAlign: "center", borderRadius: "0 0 22px 22px", position: "relative" }}>
      <div style={{ width: 54, height: 54, margin: "0 auto 10px", background: "rgba(255,255,255,.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 20h18L14 6l-3 5-2-3z" />
        </svg>
      </div>
      <div style={{ color: "#fff", fontSize: 22, fontFamily: FONT_TITLE, letterSpacing: "-.3px" }}>{titre}</div>
      {sousTitre && <div style={{ color: "#cfe6ea", fontSize: 12, marginTop: 3 }}>{sousTitre}</div>}
    </div>
  );
}

// Écran de remerciement chaleureux (fin EDL, satisfaction…)
function Merci({ message }) {
  return (
    <Card style={{ textAlign: "center", padding: "32px 20px" }}>
      <div style={{ width: 60, height: 60, margin: "0 auto 14px", background: "#e1f5ee", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0f6e56" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      </div>
      <div style={{ fontSize: 18, fontFamily: FONT_TITLE, color: C.blueDk }}>Merci !</div>
      <p style={{ fontSize: 14, color: C.muted, margin: "6px 0 0", lineHeight: 1.6 }}>{message}</p>
    </Card>
  );
}
// Parse une date locale (évite le décalage de fuseau de new Date("YYYY-MM-DD"))
const jourLocal = (d) => {
  if (!d) return null;
  if (typeof d === "string") { const [y, m, j] = d.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, j); }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

// Vitrine : UNE activité par jour. On affiche celle du jour ;
// à défaut, la prochaine animation programmée à venir.
// Bloc "Arrivée & infos pratiques" sur la page d'accueil (avant identification).
// Pensé pour les arrivées tardives/autonomes : livret, wifi, urgences.
function InfosPratiques() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { post("get-config", {}).then((r) => setCfg(r.config || {})); }, []);
  if (!cfg) return null;
  const rien = !cfg.livret_url && !cfg.wifi_code && !cfg.urgences && !cfg.arrivee_autonome;
  if (rien) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontFamily: FONT_TITLE, color: C.blueDk, fontSize: 18, letterSpacing: "-.3px", margin: "0 0 2px" }}>Arrivée &amp; infos pratiques</h2>
      <p style={{ color: C.gold, fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>Tout ce qu'il faut pour bien démarrer</p>

      {cfg.livret_url && (
        <a href={cfg.livret_url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          <Card style={{ padding: 16, display: "flex", alignItems: "center", gap: 12, borderColor: C.blue }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "#e8f1f2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: C.blueDk, fontSize: 15 }}>Livret d'accueil</div>
              <div style={{ fontSize: 13, color: C.muted }}>Guide complet de votre séjour</div>
            </div>
            <span style={{ color: C.blue, fontSize: 20 }}>→</span>
          </Card>
        </a>
      )}

      {cfg.arrivee_autonome && (
        <Card style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, color: C.blueDk, fontSize: 15, marginBottom: 4 }}>Arrivée autonome</div>
          <div style={{ fontSize: 14, color: C.text, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{cfg.arrivee_autonome}</div>
        </Card>
      )}

      {(cfg.wifi_nom || cfg.wifi_code) && (
        <Card style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#e8f1f2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13a10 10 0 0 1 14 0" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M2 8.82a15 15 0 0 1 20 0" /><line x1="12" y1="20" x2="12" y2="20" /></svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: C.blueDk, fontSize: 15 }}>Wifi</div>
            {cfg.wifi_nom && <div style={{ fontSize: 14, color: C.text }}>Réseau : <b>{cfg.wifi_nom}</b></div>}
            {cfg.wifi_code && <div style={{ fontSize: 14, color: C.text }}>Code : <b style={{ background: C.bg, padding: "1px 8px", borderRadius: 6, letterSpacing: 1 }}>{cfg.wifi_code}</b></div>}
          </div>
        </Card>
      )}

      {cfg.urgences && (
        <Card style={{ padding: 16, borderColor: C.bad }}>
          <div style={{ fontWeight: 700, color: C.bad, fontSize: 15, marginBottom: 4 }}>Urgences &amp; contacts</div>
          <div style={{ fontSize: 14, color: C.text, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{cfg.urgences}</div>
        </Card>
      )}
    </div>
  );
}

function Vitrine() {
  const [activite, setActivite] = useState(null);
  useEffect(() => {
    post("get-activites", {}).then((r) => {
      const t = (d) => { const x = jourLocal(d); return x ? x.getTime() : null; };
      const auj = t(new Date());
      const prog = (r.activites || []).filter((a) => a.date_jour);
      // activité du jour ; à défaut, la prochaine programmée à venir
      let choisie = prog.find((a) => t(a.date_jour) === auj);
      if (!choisie) {
        const futures = prog.filter((a) => t(a.date_jour) > auj).sort((a, b) => t(a.date_jour) - t(b.date_jour));
        choisie = futures[0] || null;
      }
      setActivite(choisie);
    });
  }, []);
  if (!activite) return null;
  const a = activite;
  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontFamily: FONT_TITLE, color: C.blueDk, fontSize: 18, letterSpacing: "-.3px", margin: "0 0 2px" }}>
        Idées sorties
      </h2>
      <p style={{ color: C.gold, fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>À voir, à vivre, à faire</p>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {a.image_url && <img src={a.image_url} alt={a.titre} style={{ width: "100%", height: 160, objectFit: "cover" }} />}
        <div style={{ padding: 16 }}>
          {a.categorie && <span style={{ fontSize: 12, color: C.blue, fontWeight: 700 }}>{a.categorie}</span>}
          <div style={{ fontFamily: FONT_TITLE, color: C.blueDk, fontSize: 16, letterSpacing: "-.3px", margin: "4px 0" }}>{a.titre}</div>
          <p style={{ color: C.muted, fontSize: 14, marginTop: 0 }}>{a.description}</p>
          {a.lien && <a href={a.lien} target="_blank" rel="noreferrer" style={{ color: C.gold, fontWeight: 700, fontSize: 14 }}>En savoir plus →</a>}
        </div>
      </Card>
    </div>
  );
}

// =====================================================================
// MODULE : RDV ÉTAT DES LIEUX DE DÉPART
// =====================================================================
function RdvDepart({ token }) {
  const [dispo, setDispo] = useState(null);   // { jours, mon_rdv }
  const [jourSel, setJourSel] = useState(null); // date choisie
  const [busy, setBusy] = useState(false);

  const charger = () => post("get-rdv-dispo", { token }).then(setDispo);
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, []);

  const reserver = async (date, heure) => {
    setBusy(true);
    const r = await post("book-rdv", { token, date, heure });
    setBusy(false);
    if (r.ok) { setJourSel(null); charger(); } else alert(r.error || "Erreur");
  };
  const annuler = async () => {
    if (!confirm("Annuler votre rendez-vous de départ ?")) return;
    setBusy(true);
    const r = await post("cancel-rdv", { token });
    setBusy(false);
    if (r.ok) charger(); else alert(r.error || "Erreur");
  };

  const fDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  if (!dispo) return <Card>Chargement…</Card>;

  // RDV déjà pris
  if (dispo.mon_rdv) {
    return (
      <Card style={{ textAlign: "center", padding: "28px 20px" }}>
        <div style={{ fontSize: 13, color: C.muted, textTransform: "uppercase", letterSpacing: ".5px" }}>Votre rendez-vous de départ</div>
        <div style={{ fontFamily: FONT_TITLE, color: C.blueDk, fontSize: 22, margin: "8px 0 2px" }}>{dispo.mon_rdv.heure}</div>
        <div style={{ color: C.text, fontSize: 15, textTransform: "capitalize" }}>{fDate(dispo.mon_rdv.date)}</div>
        <p style={{ color: C.muted, fontSize: 13, margin: "14px 0 18px" }}>Présentez-vous à la réception à l'heure choisie pour l'état des lieux de sortie.</p>
        <button style={{ ...btn("#e8eff0"), color: C.bad, width: "auto", padding: "10px 18px" }} disabled={busy} onClick={annuler}>Annuler / changer</button>
      </Card>
    );
  }

  // Aucun jour ouvert
  if (dispo.jours.length === 0) {
    return <Card style={{ color: C.muted }}>Aucun créneau n'est ouvert pour le moment. Rapprochez-vous de la réception.</Card>;
  }

  // Choix du jour
  if (!jourSel) {
    return (
      <>
        <Card>
          <h3 style={{ marginTop: 0, color: C.blueDk, fontFamily: FONT_TITLE, fontSize: 17, letterSpacing: "-.3px" }}>Réserver l'état des lieux de départ</h3>
          <p style={{ color: C.muted, fontSize: 14, marginTop: 0 }}>Choisissez d'abord un jour, puis un horaire.</p>
        </Card>
        {dispo.jours.map((j) => {
          const places = j.creneaux.reduce((s, c) => s + c.restant, 0);
          return (
            <Card key={j.date}>
              <button onClick={() => setJourSel(j.date)} style={{ ...btn(), display: "flex", justifyContent: "space-between", alignItems: "center", textTransform: "capitalize" }}>
                <span>{fDate(j.date)}</span>
                <span style={{ fontSize: 13, opacity: .85 }}>{places} place{places > 1 ? "s" : ""} →</span>
              </button>
            </Card>
          );
        })}
      </>
    );
  }

  // Choix de l'horaire pour le jour sélectionné
  const jour = dispo.jours.find((j) => j.date === jourSel);
  return (
    <>
      <Card>
        <button onClick={() => setJourSel(null)} style={{ ...btn("#eef5f6"), color: C.muted, width: "auto", padding: "8px 14px", fontSize: 13 }}>← Changer de jour</button>
        <h3 style={{ color: C.blueDk, fontFamily: FONT_TITLE, fontSize: 17, letterSpacing: "-.3px", margin: "14px 0 2px", textTransform: "capitalize" }}>{fDate(jourSel)}</h3>
        <p style={{ color: C.muted, fontSize: 14, marginTop: 0 }}>Sélectionnez un horaire disponible.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(92px,1fr))", gap: 8 }}>
          {jour.creneaux.map((c) => {
            const plein = c.restant <= 0;
            return (
              <button key={c.heure} disabled={plein || busy} onClick={() => reserver(jourSel, c.heure)}
                style={{ padding: "12px 6px", borderRadius: 10, border: `1px solid ${plein ? C.line : C.blue}`,
                  background: plein ? "#f3f6f7" : "#fff", color: plein ? C.muted : C.blue,
                  cursor: plein ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 15, minHeight: 52 }}>
                {c.heure}
                <div style={{ fontSize: 10, fontWeight: 500, color: plein ? C.bad : C.muted }}>{plein ? "complet" : `${c.restant} pl.`}</div>
              </button>
            );
          })}
        </div>
      </Card>
    </>
  );
}

// =====================================================================
// MODULE EDL — verrouillé par type (entrée / sortie) une fois enregistré
// =====================================================================
function EDL({ token, statusEdl, loading, onDone, onGoSatis }) {
  const [type, setType] = useState("entree");
  const [par, setPar] = useState("client");
  const [pieces, setPieces] = useState(PIECES_DEFAUT.map((p) => ({ piece: p, etat: null, commentaire: "" })));
  const [gen, setGen] = useState("");
  const [done, setDone] = useState(false);
  const [edlId, setEdlId] = useState(null);
  const [step, setStep] = useState(0); // 0 = intro, 1..N = pièces, N+1 = signature
  const [sending, setSending] = useState(false);
  const sigRef = useRef(null);

  const N = pieces.length;
  const totalSteps = N + 2; // intro + pièces + signature
  const setPiece = (i, k, v) => setPieces(pieces.map((p, j) => j === i ? { ...p, [k]: v } : p));
  const toutesEvaluees = pieces.every((p) => p.etat !== null);

  const submit = async () => {
    if (statusEdl?.[type]) return; // garde-fou : type déjà enregistré
    setSending(true);
    const signature = sigRef.current?.toDataURL?.() || null;
    const r = await post("submit-edl", { token, type, rempli_par: par, signature, commentaire_general: gen, pieces });
    setSending(false);
    if (r.ok) { setEdlId(r.edl_id); setDone(true); onDone?.(type); }
    else if (r.dejaFait) { onDone?.(type); } // la base a refusé un doublon -> on verrouille
    else alert(r.error);
  };

  if (loading && !done) return <Chargement />;

  // CTA satisfaction : affiché uniquement à la fin d'un EDL de SORTIE
  const CtaSatis = () => type !== "sortie" ? null : (
    <Card style={{ textAlign: "center", padding: "20px", borderColor: C.gold }}>
      <div style={{ fontWeight: 700, color: C.blueDk, fontSize: 15 }}>Comment s'est passé votre séjour ?</div>
      <p style={{ color: C.muted, fontSize: 14, margin: "6px 0 14px" }}>Votre avis compte : partagez-le en 1 minute avant de partir.</p>
      <button style={{ ...btn(C.gold), width: "auto", padding: "12px 22px" }} onClick={() => onGoSatis?.()}>Donner mon avis →</button>
    </Card>
  );

  // Écran final (confirmation / photos)
  if (done && !PHOTOS_EDL) return (
    <>
      <Merci message="Votre état des lieux est enregistré. Profitez bien de votre séjour à la montagne." />
      <CtaSatis />
    </>
  );
  if (done) return (
    <>
      <Merci message="Votre état des lieux est enregistré. Ajoutez des photos par pièce si vous le souhaitez (optionnel)." />
      {pieces.map((p, i) => (
        <Card key={i}><b>{p.piece}</b><PhotoUpload token={token} edlId={edlId} piece={p.piece} /></Card>
      ))}
      <Card><p style={{ color: C.muted, margin: 0, fontSize: 14 }}>Vos photos sont enregistrées au fur et à mesure.</p></Card>
      <CtaSatis />
    </>
  );

  // Barre de progression
  const Progress = () => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.muted, marginBottom: 6 }}>
        <span>{step === 0 ? "Préparation" : step <= N ? `Pièce ${step}/${N}` : "Signature"}</span>
        <span>{Math.round((step / (totalSteps - 1)) * 100)}%</span>
      </div>
      <div style={{ height: 6, background: C.line, borderRadius: 999 }}>
        <div style={{ height: "100%", width: `${(step / (totalSteps - 1)) * 100}%`, background: C.blue, borderRadius: 999, transition: "width .25s" }} />
      </div>
    </div>
  );

  // Boutons de navigation (cibles ≥ 50px)
  const navBtn = (bg, color) => ({ flex: 1, padding: "15px", borderRadius: 12, border: 0, fontWeight: 700, fontSize: 16, cursor: "pointer", background: bg, color, minHeight: 52 });

  // ÉTAPE 0 : intro (type + rempli par) — gère le verrouillage par type
  if (step === 0) {
    const verrouille = statusEdl?.[type];
    return (
      <>
        <Progress />
        <Card>
          <span style={label}>Type d'état des lieux</span>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            {[["entree", "Entrée"], ["sortie", "Sortie"]].map(([k, l]) => (
              <button key={k} onClick={() => setType(k)} style={{ ...navBtn(type === k ? C.blue : "#eef5f6", type === k ? "#fff" : C.muted) }}>
                {l}{statusEdl?.[k] ? "  🔒" : ""}
              </button>
            ))}
          </div>
          {verrouille ? (
            <div style={{ marginTop: 16, padding: 14, background: "#eef5f6", borderRadius: 12, color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
              🔒 L'état des lieux <b>{type === "entree" ? "d'entrée" : "de sortie"}</b> a déjà été enregistré le {new Date(verrouille).toLocaleDateString("fr-FR")}. Il ne peut plus être modifié. Pour toute correction, contactez la résidence.
            </div>
          ) : (
            <>
              <div style={{ height: 16 }} />
              <label style={label}>Rempli par
                <select style={{ ...inp, minHeight: 50 }} value={par} onChange={(e) => setPar(e.target.value)}>
                  <option value="client">Le client</option>
                  <option value="staff">Avec le personnel</option>
                </select>
              </label>
              <div style={{ height: 18 }} />
              <button style={navBtn(C.blue, "#fff")} onClick={() => setStep(1)}>Commencer →</button>
            </>
          )}
        </Card>
      </>
    );
  }

  // ÉTAPES 1..N : une pièce à la fois
  if (step <= N) {
    const i = step - 1;
    const p = pieces[i];
    return (
      <>
        <Progress />
        <Card>
          <h3 style={{ fontFamily: FONT_TITLE, color: C.blueDk, fontSize: 20, margin: "0 0 4px", letterSpacing: "-.3px" }}>{p.piece}</h3>
          <p style={{ color: C.muted, fontSize: 14, marginTop: 0 }}>Dans quel état se trouve cette pièce ?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[["bon", "Bon état", C.ok], ["moyen", "État moyen", C.gold], ["mauvais", "Mauvais état", C.bad], ["absent", "Non concerné (pièce absente)", C.muted]].map(([k, l, col]) => (
              <button key={k} onClick={() => setPiece(i, "etat", k)}
                style={{ padding: "16px", border: `2px solid ${p.etat === k ? col : C.line}`, borderRadius: 12,
                  background: p.etat === k ? col : "#fff", color: p.etat === k ? "#fff" : C.text,
                  cursor: "pointer", fontWeight: 700, fontSize: 16, minHeight: 56, textAlign: "left" }}>
                {p.etat === k ? "● " : "○ "}{l}
              </button>
            ))}
          </div>
          <input style={{ ...inp, minHeight: 50 }} placeholder="Remarque (optionnel)" value={p.commentaire} onChange={(e) => setPiece(i, "commentaire", e.target.value)} />
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button style={navBtn("#eef5f6", C.muted)} onClick={() => setStep(step - 1)}>← Précédent</button>
            <button style={{ ...navBtn(p.etat ? C.blue : C.line, "#fff"), cursor: p.etat ? "pointer" : "not-allowed" }}
              disabled={!p.etat} onClick={() => setStep(step + 1)}>
              {step === N ? "Terminer →" : "Suivant →"}
            </button>
          </div>
          {!p.etat && <p style={{ fontSize: 12, color: C.muted, textAlign: "center", margin: "8px 0 0" }}>Sélectionnez un état pour continuer.</p>}
        </Card>
      </>
    );
  }

  // ÉTAPE FINALE : commentaire + signature
  return (
    <>
      <Progress />
      <Card>
        <h3 style={{ fontFamily: FONT_TITLE, color: C.blueDk, fontSize: 18, margin: "0 0 12px", letterSpacing: "-.3px" }}>Dernière étape</h3>
        <label style={label}>Commentaire général<textarea style={{ ...inp, minHeight: 80 }} value={gen} onChange={(e) => setGen(e.target.value)} /></label>
        <div style={{ height: 14 }} />
        <span style={label}>Signature</span>
        <SignaturePad ref={sigRef} />
        <p style={{ fontSize: 11, color: C.muted }}>Cette signature vaut commencement de preuve, sans valeur de signature électronique qualifiée.</p>
        {!toutesEvaluees && <p style={{ color: C.bad, fontSize: 13 }}>Certaines pièces n'ont pas été évaluées. Revenez en arrière pour les compléter.</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button style={navBtn("#eef5f6", C.muted)} onClick={() => setStep(step - 1)}>← Précédent</button>
          <button style={{ ...navBtn(toutesEvaluees && !sending ? C.blue : C.line, "#fff"), cursor: toutesEvaluees && !sending ? "pointer" : "not-allowed" }}
            disabled={!toutesEvaluees || sending} onClick={submit}>
            {sending ? "Envoi…" : "Valider"}
          </button>
        </div>
      </Card>
    </>
  );
}

// Pad de signature simple (canvas tactile)
function SignaturePad({ ref }) {
  const canvasRef = useRef(null);
  useEffect(() => { if (ref) ref.current = canvasRef.current; }, [ref]);
  const draw = (e) => {
    if (e.buttons !== 1 && e.type !== "touchmove") return;
    const c = canvasRef.current, rect = c.getBoundingClientRect();
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
    const y = (e.touches?.[0]?.clientY ?? e.clientY) - rect.top;
    const ctx = c.getContext("2d");
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = C.text;
    ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y);
  };
  const end = () => canvasRef.current.getContext("2d").beginPath();
  const clear = () => { const c = canvasRef.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); };
  return (
    <div>
      <canvas ref={canvasRef} width={560} height={140}
        onMouseMove={draw} onMouseUp={end} onTouchMove={(e) => { e.preventDefault(); draw(e); }} onTouchEnd={end}
        style={{ width: "100%", height: 140, border: `1px dashed ${C.line}`, borderRadius: 10, touchAction: "none", background: "#fbfdfd" }} />
      <button onClick={clear} style={{ ...btn("#eef5f6"), color: C.muted, padding: "6px", marginTop: 6 }}>Effacer</button>
    </div>
  );
}

// Upload de photos avec compression côté client (obligatoire pour le coût Storage)
function PhotoUpload({ token, edlId, piece }) {
  const [items, setItems] = useState([]); // {url, status}

  // Compresse une image : max 1280px de large, qualité 0.7
  const compress = (file) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1280 / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.7);
    };
    img.src = URL.createObjectURL(file);
  });

  const onPick = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const idx = items.length;
      const preview = URL.createObjectURL(file);
      setItems((prev) => [...prev, { url: preview, status: "upload" }]);
      try {
        const blob = await compress(file);
        // 1) demande une URL signée
        const r = await post("edl-photo-url", { token, edl_id: edlId, piece, ext: "jpg" });
        if (!r.signedUrl) throw new Error(r.error || "URL refusée");
        // 2) pousse le fichier compressé directement dans le Storage
        const up = await fetch(r.signedUrl, {
          method: "PUT",
          headers: { "content-type": "image/jpeg" },
          body: blob,
        });
        if (!up.ok) throw new Error("Upload échoué");
        setItems((prev) => prev.map((it, j) => j === idx ? { ...it, status: "ok" } : it));
      } catch (err) {
        setItems((prev) => prev.map((it, j) => j === idx ? { ...it, status: "err" } : it));
      }
    }
    e.target.value = "";
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{ position: "relative", width: 70, height: 70 }}>
            <img src={it.url} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 8, opacity: it.status === "ok" ? 1 : .5 }} />
            <span style={{ position: "absolute", bottom: 2, right: 2, fontSize: 11, background: it.status === "ok" ? C.ok : it.status === "err" ? C.bad : C.muted, color: "#fff", borderRadius: 4, padding: "0 4px" }}>
              {it.status === "ok" ? "✓" : it.status === "err" ? "!" : "…"}
            </span>
          </div>
        ))}
      </div>
      <label style={{ ...btn("#eef5f6"), color: C.blue, display: "inline-block", padding: "8px 14px", fontSize: 14 }}>
        📷 Ajouter des photos
        <input type="file" accept="image/*" multiple capture="environment" onChange={onPick} style={{ display: "none" }} />
      </label>
    </div>
  );
}

// Incidents : NON verrouillé volontairement — un client peut signaler
// plusieurs soucis au cours de son séjour.
function Incident({ token }) {
  const [cat, setCat] = useState("Équipement");
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async () => {
    const r = await post("report-incident", { token, categorie: cat, message: msg });
    if (r.ok) setSent(true); else alert(r.error);
  };
  if (sent) return <Card><b style={{ color: C.ok }}>✓ Message transmis.</b><p style={{ color: C.muted }}>La résidence a été prévenue et revient vers vous rapidement.</p></Card>;
  return (
    <Card>
      <h3 style={{ marginTop: 0, color: C.blueDk, fontFamily: FONT_TITLE, fontSize: 16, letterSpacing: "-.3px" }}>Un souci pendant votre séjour ?</h3>
      <p style={{ color: C.muted, marginTop: 0, fontSize: 14 }}>Dites-nous tout, on s'en occupe sans attendre la fin du séjour.</p>
      <label style={label}>Catégorie
        <select style={inp} value={cat} onChange={(e) => setCat(e.target.value)}>
          {["Équipement", "Propreté", "Chauffage/Eau", "Bruit", "Autre"].map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <div style={{ height: 12 }} />
      <label style={label}>Votre message<textarea style={{ ...inp, minHeight: 90 }} value={msg} onChange={(e) => setMsg(e.target.value)} /></label>
      <div style={{ height: 14 }} />
      <button style={btn(C.gold)} disabled={!msg.trim()} onClick={submit}>Envoyer à la résidence</button>
    </Card>
  );
}

// =====================================================================
// MODULE 3a — MID-STAY — verrouillé après envoi
// =====================================================================
function MidStay({ token, dejaFait, loading, onDone }) {
  const Q = [
    ["logement_ok", "Le logement correspond à vos attentes ?"],
    ["equipements_ok", "Les équipements fonctionnent correctement ?"],
    ["proprete_ok", "La propreté est satisfaisante ?"],
  ];
  const [rep, setRep] = useState({});
  const [com, setCom] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async () => {
    if (dejaFait) return;
    const r = await post("submit-midstay", { token, ...rep, commentaire: com });
    if (r.ok || r.dejaFait) { setSent(true); onDone?.(); } else alert(r.error);
  };
  if (loading) return <Chargement />;
  if (dejaFait && !sent) return <VerrouCard titre="Enquête mi-séjour déjà envoyée" message="Merci, vos réponses sont bien enregistrées." date={dejaFait} />;
  if (sent) return <Card><b style={{ color: C.ok }}>✓ Merci !</b><p style={{ color: C.muted }}>Si vous avez signalé un point à améliorer, la résidence intervient au plus vite.</p></Card>;
  return (
    <Card>
      <h3 style={{ marginTop: 0, color: C.blueDk, fontFamily: FONT_TITLE, fontSize: 16, letterSpacing: "-.3px" }}>Comment se passe votre séjour ?</h3>
      <p style={{ color: C.muted, fontSize: 14, marginTop: 0 }}>Quelques questions rapides à mi-séjour pour qu'on corrige tout problème pendant que vous êtes encore là.</p>
      {Q.map(([k, q]) => (
        <div key={k} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{q}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setRep({ ...rep, [k]: true })}
              style={{ flex: 1, padding: 10, borderRadius: 8, cursor: "pointer", fontWeight: 700,
                border: `1px solid ${rep[k] === true ? C.ok : C.line}`, background: rep[k] === true ? C.ok : "#fff", color: rep[k] === true ? "#fff" : C.muted }}>👍 Oui</button>
            <button onClick={() => setRep({ ...rep, [k]: false })}
              style={{ flex: 1, padding: 10, borderRadius: 8, cursor: "pointer", fontWeight: 700,
                border: `1px solid ${rep[k] === false ? C.bad : C.line}`, background: rep[k] === false ? C.bad : "#fff", color: rep[k] === false ? "#fff" : C.muted }}>👎 Non</button>
          </div>
        </div>
      ))}
      <label style={label}>Précisez si besoin<textarea style={{ ...inp, minHeight: 70 }} value={com} onChange={(e) => setCom(e.target.value)} /></label>
      <div style={{ height: 14 }} />
      <button style={btn()} disabled={Object.keys(rep).length < Q.length} onClick={submit}>Envoyer</button>
    </Card>
  );
}

// =====================================================================
// MODULE 3b — SATISFACTION POST-SÉJOUR — verrouillé après envoi
// =====================================================================
function Satisfaction({ token, dejaFait, loading, onDone }) {
  const CRIT = [
    ["note_accueil", "Accueil"],
    ["note_proprete", "Propreté"],
    ["note_equipements", "Équipements"],
    ["note_literie", "Literie / confort"],
    ["note_qualite_prix", "Rapport qualité-prix"],
  ];
  const [notes, setNotes] = useState({});
  const [nps, setNps] = useState(null);
  const [pos, setPos] = useState("");
  const [amel, setAmel] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (dejaFait) return;
    const r = await post("submit-satisfaction", {
      token, ...notes, nps, point_positif: pos, point_amelioration: amel,
    });
    if (r.ok || r.dejaFait) { setSent(true); onDone?.(); } else alert(r.error);
  };
  if (loading) return <Chargement />;
  if (dejaFait && !sent) return <VerrouCard titre="Avis déjà envoyé" message="Merci, votre avis est bien enregistré. À très bientôt aux Cimes du Val d'Allos." date={dejaFait} />;
  if (sent) return <Merci message="Vos réponses nous aident à améliorer la résidence. À très bientôt aux Cimes du Val d'Allos." />;

  return (
    <Card>
      <h3 style={{ marginTop: 0, color: C.blueDk, fontFamily: FONT_TITLE, fontSize: 16, letterSpacing: "-.3px" }}>Votre avis sur le séjour</h3>
      <p style={{ color: C.muted, fontSize: 14, marginTop: 0 }}>Notez chaque critère de 1 (faible) à 5 (excellent).</p>
      {CRIT.map(([k, l]) => (
        <div key={k} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{l}</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setNotes({ ...notes, [k]: n })}
                style={{ flex: 1, height: 40, borderRadius: 8, cursor: "pointer", fontWeight: 700,
                  border: `1px solid ${notes[k] === n ? C.gold : C.line}`, background: notes[k] === n ? C.gold : "#fff", color: notes[k] === n ? "#fff" : C.text }}>{n}</button>
            ))}
          </div>
        </div>
      ))}
      <div style={{ height: 8 }} />
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Recommanderiez-vous la résidence ? (0-10)</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {[...Array(11)].map((_, n) => (
          <button key={n} onClick={() => setNps(n)}
            style={{ width: 36, height: 36, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
              border: `1px solid ${nps === n ? C.blue : C.line}`, background: nps === n ? C.blue : "#fff", color: nps === n ? "#fff" : C.text }}>{n}</button>
        ))}
      </div>
      <div style={{ height: 14 }} />
      <label style={label}>Ce que vous avez le plus apprécié<textarea style={{ ...inp, minHeight: 60 }} value={pos} onChange={(e) => setPos(e.target.value)} /></label>
      <div style={{ height: 12 }} />
      <label style={label}>Ce qu'on pourrait améliorer<textarea style={{ ...inp, minHeight: 60 }} value={amel} onChange={(e) => setAmel(e.target.value)} /></label>
      <div style={{ height: 14 }} />
      <button style={btn()} disabled={Object.keys(notes).length < CRIT.length || nps === null} onClick={submit}>Envoyer mon avis</button>
    </Card>
  );
}

// =====================================================================
// MODULE 4 — ACTIVITÉS (liste éditoriale)
// =====================================================================
function Activites() {
  const [promos, setPromos] = useState(null);
  useEffect(() => {
    post("get-promos", {}).then((r) => setPromos(r.promos || []));
  }, []);
  if (!promos) return <Card>Chargement…</Card>;
  if (promos.length === 0) return <Card style={{ color: C.muted }}>Aucune offre partenaire pour le moment.</Card>;
  return (
    <>
      <h3 style={{ fontFamily: FONT_TITLE, color: C.blueDk, fontSize: 16, letterSpacing: "-.3px", margin: "4px 0 10px" }}>Offres de nos partenaires</h3>
      {promos.map((p, i) => (
        <Card key={`promo-${i}`} style={{ padding: 16, borderColor: C.gold }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {p.logo_url && <img src={p.logo_url} alt={p.partenaire} style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 8 }} />}
            <div>
              <span style={{ fontSize: 11, color: "#fff", background: C.gold, borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>OFFRE PARTENAIRE</span>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{p.partenaire}</div>
            </div>
          </div>
          <h4 style={{ margin: "10px 0 4px", color: C.blueDk, fontSize: 15 }}>{p.titre}</h4>
          {p.description && <p style={{ color: C.muted, fontSize: 14, margin: "0 0 8px" }}>{p.description}</p>}
          {p.code_promo && <div style={{ fontSize: 14, margin: "0 0 8px" }}>Code : <b style={{ background: C.bg, padding: "2px 8px", borderRadius: 6, letterSpacing: 1 }}>{p.code_promo}</b></div>}
          {p.date_fin && <div style={{ fontSize: 12, color: C.muted }}>Valable jusqu'au {new Date(p.date_fin).toLocaleDateString("fr-FR")}</div>}
          {p.lien && <a href={p.lien} target="_blank" rel="noreferrer" style={{ color: C.gold, fontWeight: 700, fontSize: 14, display: "inline-block", marginTop: 8 }}>En profiter →</a>}
        </Card>
      ))}
    </>
  );
}
