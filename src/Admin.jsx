import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// =====================================================================
// CONFIG — clés PUBLIQUES (anon) : OK ici, Auth seulement. Les données
// passent par les Edge Functions qui vérifient le rôle admin.
// =====================================================================
const SUPABASE_URL = "https://wmwxgrhlcqluzejdolje.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtd3hncmhsY3FsdXplamRvbGplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MzQwODUsImV4cCI6MjA5NzQxMDA4NX0.PvMHdXPc6fOmXBGaOzW21aoCz4kqOMZ7no_d5-ykZ98";  // la clé anon public que tu viens de copier
const FN = `${SUPABASE_URL}/functions/v1`;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// URL autorisée dans Supabase > Authentication > URL Configuration > Redirect URLs
const PASSWORD_REDIRECT_URL = "https://lescimes.vercel.app/admin";

const C = {
  blue: "#0f5b6b", blueDk: "#0a4350", blue2: "#13708a", gold: "#f2a65a",
  bg: "#f1f6f7", card: "#fff", text: "#13343b", muted: "#5d7a81",
  line: "#dceaed", bad: "#d9534f", warn: "#d98736", ok: "#3fa34d",
};
const FONT_TITLE = "'Archivo Black',sans-serif";
const FONT_BODY = "'Plus Jakarta Sans',system-ui,sans-serif";

// Appel d'une Edge Function admin avec le JWT de la session active.
async function adminFn(name, body = {}) {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await sb.auth.getSession();

    if (sessionError || !session?.access_token) {
      return {
        error: sessionError?.message || "Session expirée. Veuillez vous reconnecter.",
        status: 401,
      };
    }

    const response = await fetch(`${FN}/${name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });

    let result = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      const error = result.error || result.message || `Erreur ${response.status} sur ${name}`;
      console.error("Erreur Edge Function", {
        name,
        status: response.status,
        result,
      });
      return { ...result, error, status: response.status };
    }

    return result;
  } catch (error) {
    console.error(`Impossible d'appeler la fonction ${name}`, error);
    return {
      error: error instanceof Error ? error.message : `Impossible d'appeler ${name}`,
      status: 0,
    };
  }
}

export default function Admin() {
  const [session, setSession] = useState(undefined);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!document.getElementById("glacier-fonts")) {
      const l = document.createElement("link");
      l.id = "glacier-fonts";
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";
      document.head.appendChild(l);
    }

    // Le lien reçu par email contient notamment #type=recovery.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hashParams.get("type") === "recovery") {
      setRecovery(true);
    }

    sb.auth.getSession().then(({ data, error }) => {
      if (error) console.error("Erreur de lecture de session", error);
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);

      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const finishRecovery = async () => {
    // Ferme les sessions existantes après le changement de mot de passe.
    await sb.auth.signOut({ scope: "global" });
    setRecovery(false);
    setSession(null);

    // Retire les jetons de récupération de l'URL affichée.
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  if (session === undefined) return <Center>Chargement…</Center>;
  if (recovery && session) return <ResetPassword onDone={finishRecovery} />;
  if (!session) return <Login />;

  return <Dashboard onLogout={() => sb.auth.signOut({ scope: "global" })} />;
}

const Center = ({ children }) => (
  <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", color: C.text }}>{children}</div>
);
const inp = { width: "100%", padding: "11px 12px", border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 15, boxSizing: "border-box", marginTop: 6 };
const btn = (bg = C.blue) => ({ background: bg, color: "#fff", border: 0, borderRadius: 10, padding: "12px 18px", fontWeight: 700, cursor: "pointer", fontSize: 15 });

// ---------- RÉINITIALISATION DU MOT DE PASSE ----------
function ResetPassword({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const updatePassword = async () => {
    setErr("");

    if (password.length < 8) {
      setErr("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    if (password !== confirmation) {
      setErr("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    const { error } = await sb.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    alert("Votre mot de passe a été modifié. Vous pouvez maintenant vous reconnecter.");
    await onDone();
  };

  return (
    <Center>
      <div style={{ width: 360, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 24 }}>
        <h2 style={{ color: C.blueDk, marginTop: 0, fontFamily: FONT_TITLE, letterSpacing: "-.4px" }}>Nouveau mot de passe</h2>
        <p style={{ color: C.muted, marginTop: 0, fontSize: 14 }}>
          Choisissez le nouveau mot de passe de votre compte administrateur.
        </p>

        <input
          style={inp}
          type="password"
          placeholder="Nouveau mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <div style={{ height: 10 }} />
        <input
          style={inp}
          type="password"
          placeholder="Confirmer le mot de passe"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="new-password"
          onKeyDown={(e) => e.key === "Enter" && updatePassword()}
        />

        {err && <p style={{ color: C.bad, fontSize: 14 }}>{err}</p>}
        <div style={{ height: 14 }} />
        <button style={{ ...btn(), width: "100%", opacity: loading ? 0.7 : 1 }} onClick={updatePassword} disabled={loading}>
          {loading ? "Enregistrement…" : "Enregistrer le mot de passe"}
        </button>
      </div>
    </Center>
  );
}

// ---------- LOGIN ----------
function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setErr("");
    setInfo("");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !pw) {
      setErr("Veuillez renseigner l'adresse email et le mot de passe.");
      return;
    }

    setLoading(true);
    const { error } = await sb.auth.signInWithPassword({
      email: cleanEmail,
      password: pw,
    });
    setLoading(false);

    if (error) {
      setErr(
        error.message === "Invalid login credentials"
          ? "Adresse email ou mot de passe incorrect."
          : error.message
      );
    }
  };

  const forgotPassword = async () => {
    setErr("");
    setInfo("");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErr("Saisissez votre adresse email avant de demander un nouveau mot de passe.");
      return;
    }

    setLoading(true);
    const { error } = await sb.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: PASSWORD_REDIRECT_URL,
    });
    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setInfo("Un email de réinitialisation vient de vous être envoyé.");
  };

  return (
    <Center>
      <div style={{ width: 360, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 24 }}>
        <h2 style={{ color: C.blueDk, marginTop: 0, fontFamily: FONT_TITLE, letterSpacing: "-.4px" }}>Administration</h2>
        <p style={{ color: C.muted, marginTop: 0, fontSize: 14 }}>Les Cimes du Val d'Allos</p>

        <input
          style={inp}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <div style={{ height: 10 }} />
        <input
          style={inp}
          type="password"
          placeholder="Mot de passe"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="current-password"
          onKeyDown={(e) => e.key === "Enter" && login()}
        />

        {err && <p style={{ color: C.bad, fontSize: 14 }}>{err}</p>}
        {info && <p style={{ color: C.ok, fontSize: 14 }}>{info}</p>}

        <div style={{ height: 14 }} />
        <button style={{ ...btn(), width: "100%", opacity: loading ? 0.7 : 1 }} onClick={login} disabled={loading}>
          {loading ? "Chargement…" : "Se connecter"}
        </button>

        <button
          type="button"
          onClick={forgotPassword}
          disabled={loading}
          style={{
            width: "100%",
            background: "none",
            border: 0,
            marginTop: 14,
            color: C.blue,
            cursor: "pointer",
            fontSize: 13,
            textDecoration: "underline",
          }}
        >
          Mot de passe oublié ?
        </button>
      </div>
    </Center>
  );
}

// ---------- DASHBOARD ----------
function Dashboard({ onLogout }) {
  const [apparts, setApparts] = useState([]);
  const [filtre, setFiltre] = useState("");
  const [depuis, setDepuis] = useState("");
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [photos, setPhotos] = useState(null); // {client, list} ou null

  const voirPhotos = async (sejourId, client) => {
    setPhotos({ client, list: null });
    const r = await adminFn("admin-edl-photos", { sejour_id: sejourId });
    setPhotos({ client, list: r.photos || [] });
  };

  useEffect(() => { adminFn("admin-list-apparts").then((r) => setApparts(r.appartements || [])); }, []);
  const load = async () => {
    setLoading(true);
    const r = await adminFn("admin-dashboard", { appartement_id: filtre || undefined, depuis: depuis || undefined });
    setData(r); setLoading(false); setLastSync(new Date());
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filtre, depuis]);

  // Rafraîchissement automatique toutes les 45 s tant que le dashboard est ouvert.
  // Remplace le push email : les nouveaux incidents apparaissent seuls.
  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => {
    const id = setInterval(() => loadRef.current(), 45000);
    return () => clearInterval(id);
  }, []);

  const setStatut = async (id, statut) => {
    await adminFn("admin-incident-update", { incident_id: id, statut });
    load();
  };

  // Compteur d'incidents non traités (statut "nouveau") pour le badge d'alerte
  const nbNouveaux = (data?.incidents || []).filter((i) => i.statut === "nouveau").length;

  const k = data?.kpis;
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", color: C.text }}>
      <header style={{ background: C.blueDk, color: "#fff", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <b style={{ fontFamily: FONT_TITLE, fontSize: 16, letterSpacing: "-.3px" }}>Dashboard — Les Cimes du Val d'Allos</b>
        <button onClick={onLogout} style={{ ...btn("rgba(255,255,255,.15)"), padding: "8px 14px", fontSize: 13 }}>Déconnexion</button>
      </header>

      {/* Filtres */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: 20, alignItems: "end" }}>
        <label style={{ fontSize: 13, color: C.muted }}>Appartement
          <select style={{ ...inp, width: 220 }} value={filtre} onChange={(e) => setFiltre(e.target.value)}>
            <option value="">Tous</option>
            {apparts.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: C.muted }}>Depuis le
          <input type="date" style={{ ...inp, width: 180 }} value={depuis} onChange={(e) => setDepuis(e.target.value)} />
        </label>
        <button onClick={load} style={{ ...btn("#e8eff0"), color: C.blue, padding: "10px 14px", fontSize: 13 }}>↻ Rafraîchir</button>
        {loading
          ? <span style={{ color: C.muted, fontSize: 13 }}>Mise à jour…</span>
          : lastSync && <span style={{ color: C.muted, fontSize: 12 }}>Dernière synchro {lastSync.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · auto toutes les 45 s</span>}
      </div>

      {/* Onglets */}
      <div style={{ display: "flex", gap: 4, padding: "0 20px", borderBottom: `1px solid ${C.line}`, overflowX: "auto" }}>
        {[["overview", "Vue d'ensemble"], ["kpi", "Indicateurs"], ["sejours", "Séjours"], ["rdv", "RDV départ"], ["relance", "À relancer"], ["satis", "Satisfaction"], ["mid", "Mi-séjour"], ["inc", "Incidents"], ["promos", "Promos"], ["activites", "Activités"], ["reglages", "Réglages"]].map(([key, l]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: "10px 16px", border: 0, background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
            fontWeight: tab === key ? 800 : 500, color: tab === key ? C.blue : C.muted, borderBottom: tab === key ? `3px solid ${C.blue}` : "3px solid transparent" }}>
            {l}
            {key === "inc" && nbNouveaux > 0 &&
              <span style={{ background: C.bad, color: "#fff", borderRadius: 999, fontSize: 11, fontWeight: 700, minWidth: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{nbNouveaux}</span>}
          </button>
        ))}
      </div>

      <main style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
        {tab === "overview" && <Overview onOpenAppart={(id) => { setFiltre(id); setTab("inc"); }} />}

        {tab === "kpi" && k && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }}>
              <KPI label="Réponses post-séjour" val={k.nb_reponses} />
              <KPI label="NPS" val={k.nps ?? "—"} color={k.nps >= 50 ? C.ok : k.nps >= 0 ? C.warn : C.bad} suffix="" />
              <KPI label="Incidents ouverts" val={k.incidents_ouverts} color={k.incidents_ouverts ? C.bad : C.ok} />
            </div>
            <NpsTrend reponses={data?.satisfaction || []} />
            <h3 style={{ color: C.blueDk, marginTop: 28, fontFamily: FONT_TITLE, fontSize: 16, letterSpacing: "-.3px" }}>Notes moyennes (sur 5)</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }}>
              <KPI label="Accueil" val={k.note_accueil ?? "—"} color={C.gold} />
              <KPI label="Propreté" val={k.note_proprete ?? "—"} color={C.gold} />
              <KPI label="Équipements" val={k.note_equipements ?? "—"} color={C.gold} />
              <KPI label="Literie" val={k.note_literie ?? "—"} color={C.gold} />
              <KPI label="Qualité-prix" val={k.note_qualite_prix ?? "—"} color={C.gold} />
            </div>
          </>
        )}

        {tab === "satis" && <SatisfactionAdmin reponses={data?.satisfaction || []} onPhotos={voirPhotos} />}

        {tab === "mid" && (
          <Table head={["Date", "Client", "Appart", "Logement", "Équip.", "Propreté", "Commentaire"]}
            rows={(data?.midstay || []).map((m) => [
              fdate(m.created_at), m._client, m._appart, ynbadge(m.logement_ok), ynbadge(m.equipements_ok), ynbadge(m.proprete_ok), m.commentaire || "—",
            ])} empty="Aucune réponse mi-séjour." />
        )}

        {tab === "inc" && (() => {
          const incs = data?.incidents || [];
          if (incs.length === 0) return <p style={{ color: C.muted }}>Aucun incident.</p>;
          // Regroupe par appartement
          const groupes = {};
          for (const i of incs) {
            const key = i._appart || "Sans appartement";
            (groupes[key] = groupes[key] || []).push(i);
          }
          const noms = Object.keys(groupes).sort();
          return (
            <div style={{ display: "grid", gap: 20 }}>
              {noms.map((nom) => {
                const ouverts = groupes[nom].filter((i) => i.statut !== "resolu").length;
                return (
                  <div key={nom}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <h3 style={{ fontFamily: FONT_TITLE, color: C.blueDk, fontSize: 16, margin: 0, letterSpacing: "-.3px" }}>{nom}</h3>
                      {ouverts > 0 && <span style={{ background: C.bad, color: "#fff", borderRadius: 999, fontSize: 12, fontWeight: 700, padding: "2px 9px" }}>{ouverts} ouvert{ouverts > 1 ? "s" : ""}</span>}
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {groupes[nom].map((i) => (
                        <div key={i.id} style={{ background: C.card, border: `1px solid ${i.statut === "resolu" ? C.line : C.bad}`, borderRadius: 12, padding: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                            <div>
                              <b style={{ color: C.blueDk }}>{i.categorie}</b>
                              <span style={{ color: C.muted, fontSize: 13 }}> · {i._client} · {fdate(i.created_at)}</span>
                              <p style={{ margin: "6px 0 0", fontSize: 14 }}>{i.message}</p>
                            </div>
                            <select value={i.statut} onChange={(e) => setStatut(i.id, e.target.value)}
                              style={{ ...inp, width: 140, marginTop: 0, alignSelf: "start",
                                borderColor: i.statut === "resolu" ? C.ok : i.statut === "en_cours" ? C.warn : C.bad }}>
                              <option value="nouveau">Nouveau</option>
                              <option value="en_cours">En cours</option>
                              <option value="resolu">Résolu</option>
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {tab === "promos" && <PromosAdmin />}
        {tab === "rdv" && <RdvAdmin />}
        {tab === "activites" && <ActivitesAdmin />}
        {tab === "reglages" && <ReglagesAdmin />}
        {tab === "relance" && <RelanceAdmin />}
        {tab === "sejours" && <SejoursAdmin apparts={apparts} />}
      </main>

      {/* Modale photos EDL */}
      {photos && (
        <div onClick={() => setPhotos(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 20, maxWidth: 800, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <b style={{ color: C.blueDk }}>Photos état des lieux — {photos.client}</b>
              <button onClick={() => setPhotos(null)} style={{ ...btn("#eef5f6"), color: C.muted, padding: "6px 12px" }}>Fermer</button>
            </div>
            {photos.list === null ? <p style={{ color: C.muted }}>Chargement…</p>
              : photos.list.length === 0 ? <p style={{ color: C.muted }}>Aucune photo pour ce séjour.</p>
              : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
                  {photos.list.map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                      <img src={p.url} alt={p.piece} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8 }} />
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{p.type === "sortie" ? "Sortie" : "Entrée"} · {p.piece}</div>
                    </a>
                  ))}
                </div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- ONGLET SATISFACTION (filtres + tri + cartes colorées) ----------
const CRIT_SAT = [["note_accueil", "Accueil"], ["note_proprete", "Propreté"], ["note_equipements", "Équip."], ["note_literie", "Literie"], ["note_qualite_prix", "Q/P"]];
const moyenneSat = (s) => {
  const v = CRIT_SAT.map(([k]) => s[k]).filter((n) => n != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const noteBg = (n) => n == null ? { bg: C.bg, fg: C.muted } : n < 3 ? { bg: "#fcebeb", fg: "#a32d2d" } : n < 4 ? { bg: "#faeeda", fg: "#854f0b" } : { bg: "#eaf3de", fg: "#3b6d11" };
const moyColor = (n) => n == null ? C.muted : n < 3 ? C.bad : n < 4 ? C.warn : C.ok;
const npsBadge = (n) => n == null ? { bg: C.bg, fg: C.muted } : n >= 9 ? { bg: "#e1f5ee", fg: "#0f6e56" } : n >= 7 ? { bg: "#f1efe8", fg: "#5f5e5a" } : { bg: "#fcebeb", fg: "#a32d2d" };

function SatisfactionAdmin({ reponses, onPhotos }) {
  const [filtre, setFiltre] = useState("tous");        // tous | negatifs | commentaire
  const [critFaible, setCritFaible] = useState("");     // "" | note_accueil | note_proprete | ...
  const [recherche, setRecherche] = useState("");
  const [tri, setTri] = useState("date_desc");
  const [copieId, setCopieId] = useState(null);

  const enrich = (reponses || []).map((s, i) => ({ ...s, _moy: moyenneSat(s), _idx: i }));

  const filtres = enrich.filter((s) => {
    if (filtre === "negatifs" && !(s._moy != null && s._moy < 3)) return false;
    if (filtre === "commentaire" && !((s.point_positif || "").trim() || (s.point_amelioration || "").trim())) return false;
    if (critFaible && !(s[critFaible] != null && s[critFaible] < 3)) return false;
    if (recherche.trim()) {
      const q = recherche.trim().toLowerCase();
      const hay = `${s._client || ""} ${s.point_positif || ""} ${s.point_amelioration || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const tries = [...filtres].sort((a, b) => {
    if (tri === "note_asc") return (a._moy ?? 99) - (b._moy ?? 99);
    if (tri === "note_desc") return (b._moy ?? -1) - (a._moy ?? -1);
    if (tri === "nps_asc") return (a.nps ?? 99) - (b.nps ?? 99);
    if (tri === "nps_desc") return (b.nps ?? -1) - (a.nps ?? -1);
    if (tri === "date_asc") return new Date(a.created_at) - new Date(b.created_at);
    return new Date(b.created_at) - new Date(a.created_at); // date_desc
  });

  const numApp = (a) => (a || "—").replace(/^Appartement\s+/i, "");

  const copier = async (s) => {
    const texte = `« ${(s.point_positif || s.point_amelioration || "").trim()} »\n— ${s._client || "Un client"}, Les Cimes du Val d'Allos${s._moy != null ? ` (${s._moy.toFixed(1).replace(".", ",")}/5)` : ""}`;
    try {
      await navigator.clipboard.writeText(texte);
      setCopieId(s._idx);
      setTimeout(() => setCopieId(null), 1500);
    } catch { alert("Copie impossible sur ce navigateur."); }
  };

  const exporterCSV = () => {
    const head = ["Appartement", "Client", "Date", "Accueil", "Propreté", "Équip.", "Literie", "Q/P", "Moyenne", "NPS", "Point positif", "Point d'amélioration", "Publication autorisée"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lignes = tries.map((s) => [
      numApp(s._appart), s._client || "", fdate(s.created_at),
      s.note_accueil ?? "", s.note_proprete ?? "", s.note_equipements ?? "", s.note_literie ?? "", s.note_qualite_prix ?? "",
      s._moy != null ? s._moy.toFixed(1) : "", s.nps ?? "",
      s.point_positif || "", s.point_amelioration || "", s.consentement_publication ? "Oui" : "Non",
    ].map(esc).join(";"));
    const csv = "\uFEFF" + [head.map(esc).join(";"), ...lignes].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `satisfaction_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const chip = (val, label) => (
    <button onClick={() => setFiltre(val)} style={{
      background: filtre === val ? C.blue : "#fff", color: filtre === val ? "#fff" : C.muted,
      fontSize: 13, fontWeight: filtre === val ? 700 : 500, padding: "7px 14px", borderRadius: 999,
      border: `1px solid ${filtre === val ? C.blue : C.line}`, cursor: "pointer",
    }}>{label}</button>
  );

  if (enrich.length === 0) return <p style={{ color: C.muted }}>Aucune réponse post-séjour.</p>;

  return (
    <div>
      {/* Filtres rapides + tri */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {chip("tous", "Tous")}
          {chip("negatifs", "Négatifs (moy < 3)")}
          {chip("commentaire", "Avec commentaire")}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: C.muted }}>Trier par</span>
          <select value={tri} onChange={(e) => setTri(e.target.value)} style={{ ...inp, width: "auto", marginTop: 0, padding: "7px 10px", fontSize: 13 }}>
            <option value="date_desc">Date (récent)</option>
            <option value="date_asc">Date (ancien)</option>
            <option value="note_asc">Note la plus basse</option>
            <option value="note_desc">Note la plus haute</option>
            <option value="nps_asc">NPS le plus bas</option>
            <option value="nps_desc">NPS le plus haut</option>
          </select>
        </div>
      </div>

      {/* Filtre par catégorie faible + recherche + export */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <select value={critFaible} onChange={(e) => setCritFaible(e.target.value)} style={{ ...inp, width: "auto", marginTop: 0, padding: "7px 10px", fontSize: 13 }}>
          <option value="">Toutes les catégories</option>
          {CRIT_SAT.map(([k, l]) => <option key={k} value={k}>{l} faible (&lt; 3)</option>)}
        </select>
        <input style={{ ...inp, width: 240, marginTop: 0, padding: "8px 12px", fontSize: 13 }} placeholder="Rechercher (client, commentaire)…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <button onClick={exporterCSV} style={{ ...btn("#e8eff0"), color: C.blue, width: "auto", padding: "8px 14px", fontSize: 13 }}>⬇ Export CSV ({tries.length})</button>
      </div>

      {tries.length === 0 && <p style={{ color: C.muted }}>Aucun avis pour ce filtre.</p>}

      {/* Cartes */}
      <div style={{ display: "grid", gap: 12 }}>
        {tries.map((s) => {
          const moy = s._moy;
          const nb = npsBadge(s.nps);
          const critique = moy != null && moy < 3;
          const publiable = !!s.consentement_publication && ((s.point_positif || "").trim() || (s.point_amelioration || "").trim());
          return (
            <div key={s._idx} style={{ background: C.card, border: `1px solid ${critique ? C.bad : C.line}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 16, color: C.blueDk, fontWeight: 700 }}>
                    {numApp(s._appart)} <span style={{ color: C.muted, fontWeight: 400 }}>· {s._client || "—"}</span>
                    {s.consentement_publication && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "#3b6d11", background: "#eaf3de", borderRadius: 6, padding: "2px 7px" }}>Publication autorisée</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>{fdate(s.created_at)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: C.muted }}>Moyenne</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: moyColor(moy) }}>{moy == null ? "—" : moy.toFixed(1).replace(".", ",")}</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: C.muted }}>NPS</div>
                    <span style={{ background: nb.bg, color: nb.fg, fontWeight: 700, fontSize: 14, padding: "3px 10px", borderRadius: 8 }}>{s.nps ?? "—"}</span>
                  </div>
                  {publiable && (
                    <button onClick={() => copier(s)} style={{ ...btn(copieId === s._idx ? C.ok : "#eef5f6"), color: copieId === s._idx ? "#fff" : C.blue, padding: "6px 10px", fontSize: 13 }} title="Copier pour publication">
                      {copieId === s._idx ? "✓ Copié" : "📋 Copier"}
                    </button>
                  )}
                  {onPhotos && <button onClick={() => onPhotos(s.sejour_id, s._client)} style={{ ...btn("#eef5f6"), color: C.blue, padding: "6px 10px", fontSize: 13 }} title="Photos EDL">📷</button>}
                </div>
              </div>

              {/* Pastilles par critère */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                {CRIT_SAT.map(([k, lab]) => {
                  const col = noteBg(s[k]);
                  return <span key={k} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 6, background: col.bg, color: col.fg, boxShadow: k === critFaible ? `0 0 0 1px ${C.blue}` : "none" }}>{lab} {s[k] ?? "—"}</span>;
                })}
              </div>

              {/* Verbatims */}
              {(s.point_positif || s.point_amelioration) && (
                <div style={{ marginTop: 12, fontSize: 13, color: C.text, lineHeight: 1.6 }}>
                  {s.point_positif && <div><span style={{ color: C.ok, fontWeight: 700 }}>+</span> {s.point_positif}</div>}
                  {s.point_amelioration && <div><span style={{ color: C.bad, fontWeight: 700 }}>–</span> {s.point_amelioration}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Graphique d'évolution du NPS par mois (barres CSS, sans librairie)
function NpsTrend({ reponses }) {
  // Regroupe par mois (AAAA-MM), calcule le NPS de chaque mois
  const parMois = {};
  for (const r of reponses) {
    if (r.nps == null || !r.created_at) continue;
    const mois = r.created_at.slice(0, 7);
    (parMois[mois] = parMois[mois] || []).push(r.nps);
  }
  const mois = Object.keys(parMois).sort();
  if (mois.length < 2) return null; // pas d'évolution à montrer avec < 2 mois

  const nps = (arr) => {
    const prom = arr.filter((n) => n >= 9).length, det = arr.filter((n) => n <= 6).length;
    return Math.round(((prom - det) / arr.length) * 100);
  };
  const series = mois.map((m) => ({ mois: m, nps: nps(parMois[m]) }));
  const labelMois = (m) => {
    const [a, mo] = m.split("-");
    return ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"][+mo - 1] + " " + a.slice(2);
  };
  const barColor = (n) => n >= 50 ? C.ok : n >= 0 ? C.warn : C.bad;

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ color: C.blueDk, fontFamily: FONT_TITLE, fontSize: 16, letterSpacing: "-.3px", marginBottom: 12 }}>Évolution du NPS</h3>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "18px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
          {series.map((s) => {
            // NPS va de -100 à +100 ; hauteur relative sur 0..100% de la zone
            const h = Math.max(4, ((s.nps + 100) / 200) * 100);
            return (
              <div key={s.mois} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: barColor(s.nps), marginBottom: 4 }}>{s.nps}</span>
                <div style={{ width: "100%", maxWidth: 48, height: `${h}%`, background: barColor(s.nps), borderRadius: "6px 6px 0 0", transition: "height .3s" }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {series.map((s) => (
            <div key={s.mois} style={{ flex: 1, textAlign: "center", fontSize: 11, color: C.muted }}>{labelMois(s.mois)}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

const KPI = ({ label, val, color = C.blue, suffix }) => (
  <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
    <div style={{ fontSize: 13, color: C.muted }}>{label}</div>
    <div style={{ fontSize: 30, fontFamily: FONT_TITLE, color, letterSpacing: "-.5px" }}>{val}{suffix}</div>
  </div>
);

function Table({ head, rows, empty }) {
  if (!rows.length) return <p style={{ color: C.muted }}>{empty}</p>;
  return (
    <div style={{ overflowX: "auto", background: C.card, border: `1px solid ${C.line}`, borderRadius: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={{ textAlign: "left", padding: 10, color: C.muted, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const fdate = (d) => new Date(d).toLocaleDateString("fr-FR");
const ynbadge = (v) => v === false
  ? <span style={{ color: "#fff", background: C.bad, borderRadius: 6, padding: "2px 8px", fontSize: 12 }}>Non</span>
  : v === true ? <span style={{ color: "#fff", background: C.ok, borderRadius: 6, padding: "2px 8px", fontSize: 12 }}>Oui</span> : "—";

// Jour local (sans décalage de fuseau) à partir d'une date "AAAA-MM-JJ"
const jourSejour = (d) => { if (!d) return null; const [y, m, j] = String(d).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, j).getTime(); };
// Statut d'un séjour : À venir / En cours / Terminé
const statutSejour = (s) => {
  const auj = jourSejour(new Date().toISOString());
  const arr = jourSejour(s.date_arrivee);
  const dep = jourSejour(s.date_depart);
  if (arr != null && arr > auj) return { label: "À venir", color: C.blue };
  if (dep != null && dep <= auj) return { label: "Terminé", color: C.muted };
  return { label: "En cours", color: C.ok };
};
// Validation simple d'un email (repérage des saisies ratées)
const emailValide = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || "").trim());

// ---------- VUE D'ENSEMBLE PAR APPARTEMENT ----------
function Overview({ onOpenAppart }) {
  const [lignes, setLignes] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => { adminFn("admin-overview").then((r) => setLignes(r.lignes || [])); }, []);
  if (!lignes) return <p style={{ color: C.muted }}>Chargement…</p>;

  // Par défaut, on masque les appartements sans aucune donnée pour alléger
  const visibles = lignes.filter((l) =>
    (!q || l.nom.toLowerCase().includes(q.toLowerCase()))
  );
  const actifs = visibles.filter((l) => l.nb_sejours > 0 || l.incidents_total > 0);
  const vides = visibles.filter((l) => l.nb_sejours === 0 && l.incidents_total === 0);

  const npsColor = (n) => n == null ? C.muted : n >= 50 ? C.ok : n >= 0 ? C.warn : C.bad;
  const noteColor = (n) => n == null ? C.muted : n >= 4 ? C.ok : n >= 3 ? C.warn : C.bad;

  const Ligne = ({ l }) => (
    <tr style={{ cursor: l.incidents_total ? "pointer" : "default" }} onClick={() => l.incidents_total && onOpenAppart(l.id)}>
      <td style={{ padding: 12, borderBottom: `1px solid ${C.bg}`, fontWeight: 700, color: C.blueDk }}>{l.nom}</td>
      <td style={{ padding: 12, borderBottom: `1px solid ${C.bg}`, textAlign: "center" }}>{l.nb_sejours}</td>
      <td style={{ padding: 12, borderBottom: `1px solid ${C.bg}`, textAlign: "center" }}>{l.nb_reponses}</td>
      <td style={{ padding: 12, borderBottom: `1px solid ${C.bg}`, textAlign: "center", fontWeight: 700, color: noteColor(l.note_moy) }}>{l.note_moy ?? "—"}</td>
      <td style={{ padding: 12, borderBottom: `1px solid ${C.bg}`, textAlign: "center", fontWeight: 700, color: npsColor(l.nps) }}>{l.nps ?? "—"}</td>
      <td style={{ padding: 12, borderBottom: `1px solid ${C.bg}`, textAlign: "center" }}>
        {l.incidents_ouverts > 0
          ? <span style={{ background: C.bad, color: "#fff", borderRadius: 999, fontSize: 12, fontWeight: 700, padding: "2px 9px" }}>{l.incidents_ouverts}</span>
          : <span style={{ color: C.muted }}>0</span>}
      </td>
    </tr>
  );

  const Tete = () => (
    <thead><tr>{["Appartement", "Séjours", "Réponses", "Note moy.", "NPS", "Incidents ouv."].map((h, i) =>
      <th key={i} style={{ textAlign: i === 0 ? "left" : "center", padding: 12, color: C.muted, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap", fontSize: 13 }}>{h}</th>)}</tr></thead>
  );

  return (
    <div>
      <input style={{ ...inp, maxWidth: 300, marginBottom: 16 }} placeholder="Rechercher un appartement…" value={q} onChange={(e) => setQ(e.target.value)} />
      {actifs.length === 0 && vides.length === 0 && <p style={{ color: C.muted }}>Aucun appartement.</p>}

      {actifs.length > 0 && (
        <div style={{ overflowX: "auto", background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, marginBottom: 18 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <Tete />
            <tbody>{actifs.map((l) => <Ligne key={l.id} l={l} />)}</tbody>
          </table>
        </div>
      )}

      {vides.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", color: C.muted, fontSize: 14, marginBottom: 10 }}>
            {vides.length} appartement{vides.length > 1 ? "s" : ""} sans activité (afficher)
          </summary>
          <div style={{ overflowX: "auto", background: C.card, border: `1px solid ${C.line}`, borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <Tete />
              <tbody>{vides.map((l) => <Ligne key={l.id} l={l} />)}</tbody>
            </table>
          </div>
        </details>
      )}
      <p style={{ fontSize: 12, color: C.muted, marginTop: 12 }}>Cliquez sur une ligne avec des incidents pour voir le détail.</p>
    </div>
  );
}

// ---------- VUE D'ENSEMBLE : fin ----------

function SejoursAdmin({ apparts }) {
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [tri, setTri] = useState("arrivee_desc");
  const [fiche, setFiche] = useState(null); // détail du séjour ouvert
  const load = () => adminFn("admin-sejours-list").then((r) => setList(r.sejours || []));
  useEffect(() => { load(); }, []);

  const openFiche = async (sejourId) => {
    setFiche({ loading: true });
    const r = await adminFn("admin-sejour-detail", { sejour_id: sejourId });
    setFiche(r.error ? { error: r.error } : r);
  };

  const reaffect = async (sejourId, appartementId) => {
    if (!appartementId) return;
    const r = await adminFn("admin-sejour-reaffect", { sejour_id: sejourId, appartement_id: appartementId });
    if (r.ok) load(); else alert(r.error);
  };

  const cloturer = async (s) => {
    const qui = s.nom_client || s.email || "ce client";
    if (!confirm(`Clôturer le séjour de « ${qui} » ?\n\nLa date de départ sera fixée à aujourd'hui. Le séjour passe « Terminé » et pourra être relancé pour l'enquête de satisfaction.`)) return;
    const r = await adminFn("admin-sejour-cloturer", { sejour_id: s.id });
    if (r.error) { alert(r.error); return; }
    load();
  };

  const del = async (s) => {
    const qui = s.nom_client || s.email || "ce client";
    if (!confirm(`Supprimer définitivement le séjour de « ${qui} » (arrivée ${fdate(s.date_arrivee)}) ?\n\nCela efface aussi son état des lieux, ses incidents et ses enquêtes. Action irréversible.`)) return;
    const r = await adminFn("admin-sejour-delete", { sejour_id: s.id });
    if (r.error) { alert(r.error); return; }
    load();
  };

  const filtered = (list || []).filter((s) =>
    !q || (s.nom_client || "").toLowerCase().includes(q.toLowerCase())
       || (s.email || "").toLowerCase().includes(q.toLowerCase())
       || (s.appart_nom || "").toLowerCase().includes(q.toLowerCase()));

  const tries = [...filtered].sort((a, b) => {
    const arA = a.date_arrivee ? new Date(a.date_arrivee).getTime() : 0;
    const arB = b.date_arrivee ? new Date(b.date_arrivee).getTime() : 0;
    const depA = a.date_depart ? new Date(a.date_depart).getTime() : 0;
    const depB = b.date_depart ? new Date(b.date_depart).getTime() : 0;
    if (tri === "arrivee_asc") return arA - arB;
    if (tri === "arrivee_desc") return arB - arA;
    if (tri === "depart_asc") return (depA || Infinity) - (depB || Infinity);
    if (tri === "depart_desc") return depB - depA;
    if (tri === "client_az") return (a.nom_client || "").localeCompare(b.nom_client || "");
    if (tri === "appart") return (a.appart_nom || "").localeCompare(b.appart_nom || "");
    return arB - arA;
  });

  if (!list) return <p style={{ color: C.muted }}>Chargement…</p>;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <input style={{ ...inp, maxWidth: 360, marginTop: 0 }} placeholder="Rechercher (nom, email, appartement)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: C.muted }}>Trier par</span>
          <select value={tri} onChange={(e) => setTri(e.target.value)} style={{ ...inp, width: "auto", marginTop: 0, padding: "7px 10px", fontSize: 13 }}>
            <option value="arrivee_desc">Arrivée (récent)</option>
            <option value="arrivee_asc">Arrivée (ancien)</option>
            <option value="depart_asc">Départ (le plus proche)</option>
            <option value="depart_desc">Départ (le plus lointain)</option>
            <option value="client_az">Client (A-Z)</option>
            <option value="appart">Appartement</option>
          </select>
        </div>
      </div>

      {tries.length === 0 ? <p style={{ color: C.muted }}>Aucun séjour.</p>
        : <div style={{ overflowX: "auto", background: C.card, border: `1px solid ${C.line}`, borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{["Client", "Email", "Arrivée", "Départ", "Statut", "Appartement", "Fiche", "Réaffecter à"].map((h, i) =>
                <th key={i} style={{ textAlign: "left", padding: 10, color: C.muted, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>{tries.map((s) => {
                const st = statutSejour(s);
                return (
                <tr key={s.id}>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>{s.nom_client}</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>
                    {emailValide(s.email)
                      ? s.email
                      : <span style={{ color: C.bad, fontWeight: 700 }} title="Email invalide">{s.email || "—"} ⚠</span>}
                  </td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>{fdate(s.date_arrivee)}</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>{s.date_depart ? fdate(s.date_depart) : "—"}</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: st.color, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>{st.label}</span>
                    {!s.date_depart && (
                      <button onClick={() => cloturer(s)} style={{ ...btn(C.gold), padding: "4px 10px", fontSize: 12, marginTop: 6, display: "block" }}>Clôturer</button>
                    )}
                  </td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}`, fontWeight: 700 }}>{s.appart_nom || "—"}</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={{ ...btn(C.blue), padding: "4px 10px", fontSize: 12 }} onClick={() => openFiche(s.id)}>Voir</button>
                      <button style={{ ...btn("#e8eff0"), color: C.bad, padding: "4px 10px", fontSize: 12 }} onClick={() => del(s)}>Suppr.</button>
                    </div>
                  </td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>
                    <select defaultValue="" onChange={(e) => reaffect(s.id, e.target.value)}
                      style={{ ...inp, width: 180, marginTop: 0 }}>
                      <option value="">— Changer —</option>
                      {(apparts || []).map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                    </select>
                  </td>
                </tr>
                );
              })}</tbody>
            </table>
          </div>}

      {fiche && <FicheSejour fiche={fiche} onClose={() => setFiche(null)} />}
    </div>
  );
}
// ---------- FICHE DÉTAILLÉE D'UN SÉJOUR ----------
function FicheSejour({ fiche, onClose }) {
  const note = (n) => n == null ? "—" : `${n}/5`;
  const etatColor = (e) => e === "mauvais" ? C.bad : e === "moyen" ? C.warn : e === "absent" ? C.muted : C.ok;
  const etatLabel = (e) => e === "absent" ? "non concerné" : e;
  const s = fiche.sejour;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, maxWidth: 720, width: "100%", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
          <b style={{ fontFamily: FONT_TITLE, color: C.blueDk, fontSize: 18 }}>Fiche séjour</b>
          <button onClick={onClose} style={{ ...btn("#e8eff0"), color: C.muted, padding: "6px 12px" }}>Fermer</button>
        </div>

        {fiche.loading && <p style={{ color: C.muted }}>Chargement…</p>}
        {fiche.error && <p style={{ color: C.bad }}>{fiche.error}</p>}

        {s && <>
          {/* Infos client */}
          <div style={{ background: C.bg, borderRadius: 10, padding: 16, marginBottom: 18 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.blueDk }}>{s.nom_client}</div>
            <div style={{ color: C.muted, fontSize: 14 }}>{s.email}</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>
              <b>{s.appart_nom || "—"}</b> · arrivée {fdate(s.date_arrivee)}{s.date_depart ? ` · départ ${fdate(s.date_depart)}` : ""}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Offres acceptées : {s.consent_marketing ? "oui" : "non"}</div>
          </div>

          {/* États des lieux */}
          <Section titre="États des lieux">
            {fiche.edl.length === 0 ? <Vide /> : fiche.edl.map((e, i) => (
              <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, color: C.blueDk }}>{e.type === "sortie" ? "Sortie" : "Entrée"} · rempli par {e.rempli_par === "staff" ? "le personnel" : "le client"} · {fdate(e.created_at)}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {e.pieces.map((p, j) => (
                    <span key={j} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 6, background: "#fff", border: `1px solid ${etatColor(p.etat)}`, color: etatColor(p.etat) }}>
                      {p.piece} : {etatLabel(p.etat)}{p.commentaire ? ` (${p.commentaire})` : ""}
                    </span>
                  ))}
                </div>
                {e.commentaire_general && <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>« {e.commentaire_general} »</div>}
              </div>
            ))}
          </Section>

          {/* Mi-séjour */}
          <Section titre="Mi-séjour">
            {fiche.midstay.length === 0 ? <Vide /> : fiche.midstay.map((m, i) => (
              <div key={i} style={{ fontSize: 14, marginBottom: 6 }}>
                Logement : {ynbadge(m.logement_ok)} · Équipements : {ynbadge(m.equipements_ok)} · Propreté : {ynbadge(m.proprete_ok)}
                {m.commentaire && <div style={{ color: C.muted, fontSize: 13 }}>« {m.commentaire} »</div>}
              </div>
            ))}
          </Section>

          {/* Satisfaction */}
          <Section titre="Satisfaction post-séjour">
            {fiche.satisfaction.length === 0 ? <Vide /> : fiche.satisfaction.map((sa, i) => (
              <div key={i} style={{ fontSize: 14, marginBottom: 8 }}>
                <div>Accueil {note(sa.note_accueil)} · Propreté {note(sa.note_proprete)} · Équip. {note(sa.note_equipements)} · Literie {note(sa.note_literie)} · Q/P {note(sa.note_qualite_prix)} · NPS {sa.nps ?? "—"}/10</div>
                {sa.point_positif && <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>+ {sa.point_positif}</div>}
                {sa.point_amelioration && <div style={{ color: C.muted, fontSize: 13 }}>– {sa.point_amelioration}</div>}
              </div>
            ))}
          </Section>

          {/* RDV de départ */}
          <Section titre="RDV état des lieux de départ">
            {fiche.rdv
              ? <div style={{ fontSize: 14 }}><b style={{ color: C.blueDk }}>{new Date(fiche.rdv.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</b> à <b>{fiche.rdv.heure}</b></div>
              : <Vide />}
          </Section>

          {/* Incidents */}
          <Section titre="Incidents">
            {fiche.incidents.length === 0 ? <Vide /> : fiche.incidents.map((inc, i) => (
              <div key={i} style={{ fontSize: 14, marginBottom: 6 }}>
                <b>{inc.categorie}</b> · <span style={{ color: inc.statut === "resolu" ? C.ok : inc.statut === "en_cours" ? C.warn : C.bad }}>{inc.statut}</span> · {fdate(inc.created_at)}
                <div style={{ color: C.muted, fontSize: 13 }}>{inc.message}</div>
              </div>
            ))}
          </Section>
        </>}
      </div>
    </div>
  );
}
const Section = ({ titre, children }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ fontFamily: FONT_TITLE, color: C.blueDk, fontSize: 14, marginBottom: 8, letterSpacing: "-.3px" }}>{titre}</div>
    {children}
  </div>
);
const Vide = () => <span style={{ color: C.muted, fontSize: 13 }}>Aucune donnée.</span>;

// ---------- RDV ÉTAT DES LIEUX DE DÉPART (admin) ----------
const hmm = (t) => (t || "").slice(0, 5);
function genSlots(debut, fin) {
  const toMin = (t) => { const p = (t || "").split(":"); return (+p[0]) * 60 + (+p[1]); };
  const pad = (n) => String(n).padStart(2, "0");
  const out = [];
  for (let t = toMin(debut); t < toMin(fin); t += 15) out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  return out;
}
function RdvAdmin() {
  const [data, setData] = useState(null);
  const [neo, setNeo] = useState({ date_debut: "", date_fin: "", heure_debut: "09:00", heure_fin: "12:00" });
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [sejours, setSejours] = useState([]);
  const [slotSel, setSlotSel] = useState(null);
  const [qCli, setQCli] = useState("");
  const [apManuel, setApManuel] = useState("");
  const lbl = { fontSize: 13, fontWeight: 700, color: C.muted };
  const numApp = (a) => (a || "—").replace(/^Appartement\s+/i, "");

  const load = () => adminFn("admin-rdv-list").then(setData);
  useEffect(() => {
    load();
    adminFn("admin-sejours-list").then((r) => setSejours(r.sejours || []));
  }, []);

  const toISO = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

  const ajouter = async () => {
    if (!neo.date_debut) { alert("Choisissez au moins la date de début."); return; }
    const fin = neo.date_fin || neo.date_debut;
    if (fin < neo.date_debut) { alert("La date de fin doit être après la date de début."); return; }
    if (neo.heure_debut >= neo.heure_fin) { alert("L'heure de fin doit être après l'heure de début."); return; }
    const jours = [];
    let d0 = new Date(neo.date_debut + "T00:00:00");
    const d1 = new Date(fin + "T00:00:00");
    while (d0 <= d1) { jours.push(toISO(d0)); d0.setDate(d0.getDate() + 1); }
    if (jours.length > 60 && !confirm(`Ouvrir ${jours.length} jours ? Cela peut être long.`)) return;
    setAjoutEnCours(true);
    let erreurs = 0;
    for (const date of jours) {
      const r = await adminFn("admin-rdv-jour-save", { date, ouvert: true, heure_debut: neo.heure_debut, heure_fin: neo.heure_fin });
      if (!r.ok) erreurs++;
    }
    setAjoutEnCours(false);
    if (erreurs) alert(`${erreurs} jour(s) non enregistré(s).`);
    setNeo({ date_debut: "", date_fin: "", heure_debut: "09:00", heure_fin: "12:00" });
    load();
  };
  const majPlage = async (j) => {
    const d = drafts[j.id] || {};
    const r = await adminFn("admin-rdv-jour-save", { id: j.id, date: j.date, ouvert: j.ouvert, heure_debut: d.heure_debut ?? hmm(j.heure_debut), heure_fin: d.heure_fin ?? hmm(j.heure_fin) });
    if (r.ok) load(); else alert(r.error);
  };
  const toggleOuvert = async (j) => {
    const r = await adminFn("admin-rdv-jour-save", { id: j.id, date: j.date, ouvert: !j.ouvert, heure_debut: hmm(j.heure_debut), heure_fin: hmm(j.heure_fin) });
    if (r.ok) load(); else alert(r.error);
  };
  const supprJour = async (j) => {
    if (!confirm("Supprimer ce jour et ses créneaux ? (les réservations de ce jour seront aussi retirées)")) return;
    const r = await adminFn("admin-rdv-jour-delete", { id: j.id });
    if (r.ok) load(); else alert(r.error);
  };
  const toggleCreneau = async (date, heure) => {
    const r = await adminFn("admin-rdv-fermeture-toggle", { date, heure });
    if (r.ok) load(); else alert(r.error);
  };
  const bookFor = async (sejour_id) => {
    const r = await adminFn("admin-rdv-book", { sejour_id, date: slotSel.date, heure: slotSel.heure });
    if (r.ok) { setQCli(""); load(); } else alert(r.error);
  };
  const bookManuel = async () => {
    if (!apManuel.trim()) return;
    const r = await adminFn("admin-rdv-book", { appartement_manuel: apManuel.trim(), date: slotSel.date, heure: slotSel.heure });
    if (r.ok) { setApManuel(""); load(); } else alert(r.error);
  };
  const unbook = async (id) => {
    const r = await adminFn("admin-rdv-unbook", { id });
    if (r.ok) load(); else alert(r.error);
  };
  const imprimerJour = (j, reservationsJour) => {
    const fD = new Date(j.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const lignes = reservationsJour.length
      ? reservationsJour.map((r) => `<tr><td>${r.heure}</td><td><b>${numApp(r.appart)}</b></td><td>${r.client || ""}</td><td></td></tr>`).join("")
      : `<tr><td colspan="4" style="text-align:center;color:#888">Aucune réservation</td></tr>`;
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>EDL départ — ${fD}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#13343b;padding:24px}
        h1{font-size:18px;margin:0 0 2px} .sub{color:#5d7a81;font-size:13px;margin:0 0 18px}
        table{width:100%;border-collapse:collapse;font-size:14px}
        th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #dceaed}
        th{font-size:12px;color:#5d7a81;text-transform:uppercase;letter-spacing:.3px}
        td:nth-child(4){width:120px} @media print{button{display:none}}
      </style></head><body>
      <h1>États des lieux de départ</h1>
      <p class="sub">${fD} — Les Cimes du Val d'Allos</p>
      <table><thead><tr><th>Heure</th><th>Appartement</th><th>Client</th><th>Signature / visa</th></tr></thead>
      <tbody>${lignes}</tbody></table>
      <button onclick="window.print()" style="margin-top:20px;padding:10px 16px;border:0;border-radius:8px;background:#0f5b6b;color:#fff;font-weight:700;cursor:pointer">Imprimer</button>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { alert("Autorisez les fenêtres pop-up pour imprimer."); return; }
    w.document.write(html); w.document.close();
  };

  if (!data) return <p style={{ color: C.muted }}>Chargement…</p>;

  const fermSet = new Set((data.fermetures || []).map((f) => `${f.date}|${f.heure}`));
  const resaMap = {};
  for (const r of data.reservations || []) {
    const k = `${r.date}|${r.heure}`;
    (resaMap[k] = resaMap[k] || []).push(r);
  }
  const fDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const joursActifs = (data.jours || []).filter((j) => j.ouvert);
  const joursArchives = (data.jours || []).filter((j) => !j.ouvert);

  const CarteJour = ({ j }) => {
    const d = drafts[j.id] || {};
    const slots = genSlots(hmm(j.heure_debut), hmm(j.heure_fin));
    const nbResa = slots.reduce((s, h) => s + (resaMap[`${j.date}|${h}`]?.length || 0), 0);
    return (
      <div key={j.id} style={{ background: C.card, border: `1px solid ${j.ouvert ? C.line : C.warn}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 12, color: j.ouvert ? C.ok : C.warn, fontWeight: 700 }}>{j.ouvert ? "● OUVERT" : "○ FERMÉ"}</span>
            <b style={{ color: C.blueDk, display: "block", textTransform: "capitalize" }}>{fDate(j.date)}</b>
            <span style={{ fontSize: 13, color: C.muted }}>{nbResa} réservation{nbResa > 1 ? "s" : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={{ ...btn("#e8eff0"), color: C.blue, width: "auto", padding: "8px 12px", fontSize: 13 }} onClick={() => imprimerJour(j, (data.reservations || []).filter((r) => r.date === j.date).sort((a, b) => a.heure.localeCompare(b.heure)))}>🖨 Imprimer</button>
            <button style={{ ...btn(j.ouvert ? "#e8eff0" : C.ok), color: j.ouvert ? C.muted : "#fff", width: "auto", padding: "8px 12px", fontSize: 13 }} onClick={() => toggleOuvert(j)}>{j.ouvert ? "Fermer le jour" : "Rouvrir"}</button>
            <button style={{ ...btn("#e8eff0"), color: C.bad, width: "auto", padding: "8px 12px", fontSize: 13 }} onClick={() => supprJour(j)}>Suppr.</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "end", marginTop: 12, flexWrap: "wrap" }}>
          <label style={lbl}>Début<input type="time" step="900" style={{ ...inp, width: 120 }} value={d.heure_debut ?? hmm(j.heure_debut)} onChange={(e) => setDrafts({ ...drafts, [j.id]: { ...d, heure_debut: e.target.value } })} /></label>
          <label style={lbl}>Fin<input type="time" step="900" style={{ ...inp, width: 120 }} value={d.heure_fin ?? hmm(j.heure_fin)} onChange={(e) => setDrafts({ ...drafts, [j.id]: { ...d, heure_fin: e.target.value } })} /></label>
          <button style={{ ...btn("#e8eff0"), color: C.blue, width: "auto", padding: "9px 14px", fontSize: 13 }} onClick={() => majPlage(j)}>Mettre à jour la plage</button>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Cliquez un créneau pour réserver pour un client, retirer une réservation ou le fermer.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8 }}>
            {slots.map((h) => {
              const ferme = fermSet.has(`${j.date}|${h}`);
              const occ = resaMap[`${j.date}|${h}`] || [];
              return (
                <div key={h} onClick={() => setSlotSel({ date: j.date, heure: h })}
                  style={{ cursor: "pointer", border: `1px solid ${ferme ? C.bad : C.line}`, borderRadius: 8, padding: "8px 10px",
                    background: ferme ? "#fcebeb" : "#fff", opacity: ferme ? .8 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <b style={{ color: ferme ? C.bad : C.blueDk, fontSize: 14, textDecoration: ferme ? "line-through" : "none" }}>{h}</b>
                    <span style={{ fontSize: 11, color: occ.length >= 3 ? C.bad : C.muted }}>{ferme ? "fermé" : `${occ.length}/3`}</span>
                  </div>
                  {occ.map((o, i) => (
                    <div key={i} style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <b style={{ color: C.blueDk }}>{numApp(o.appart)}</b>{o.manuel && <span style={{ color: C.gold }}> ✎</span>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>
        <h3 style={{ fontFamily: FONT_TITLE, color: C.blueDk, marginTop: 0, fontSize: 15 }}>Ouvrir des jours à la réservation</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <label style={lbl}>Du<input type="date" style={{ ...inp, width: 160 }} value={neo.date_debut} onChange={(e) => setNeo({ ...neo, date_debut: e.target.value })} /></label>
          <label style={lbl}>Au (optionnel)<input type="date" style={{ ...inp, width: 160 }} value={neo.date_fin} onChange={(e) => setNeo({ ...neo, date_fin: e.target.value })} /></label>
          <label style={lbl}>Début<input type="time" step="900" style={{ ...inp, width: 120 }} value={neo.heure_debut} onChange={(e) => setNeo({ ...neo, heure_debut: e.target.value })} /></label>
          <label style={lbl}>Fin<input type="time" step="900" style={{ ...inp, width: 120 }} value={neo.heure_fin} onChange={(e) => setNeo({ ...neo, heure_fin: e.target.value })} /></label>
          <button style={{ ...btn(), width: "auto", opacity: ajoutEnCours ? .7 : 1 }} disabled={ajoutEnCours} onClick={ajouter}>{ajoutEnCours ? "Ouverture…" : "Ouvrir la période"}</button>
        </div>
        <p style={{ fontSize: 12, color: C.muted, margin: "10px 0 0" }}>Laissez « Au » vide pour ouvrir un seul jour. Tous les jours de la période reçoivent la même plage horaire (créneaux de 15 min, 3 places chacun). Vous pourrez ensuite ajuster ou fermer chaque jour individuellement.</p>
      </div>

      {joursActifs.length === 0 && joursArchives.length === 0 && <p style={{ color: C.muted }}>Aucun jour ouvert. Ajoutez-en un ci-dessus.</p>}

      {joursActifs.map((j) => <CarteJour key={j.id} j={j} />)}

      {joursArchives.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", color: C.muted, fontSize: 14, marginBottom: 10, fontWeight: 700 }}>
            📁 Archives — {joursArchives.length} jour{joursArchives.length > 1 ? "s" : ""} fermé{joursArchives.length > 1 ? "s" : ""}
          </summary>
          <div style={{ marginTop: 10 }}>
            {joursArchives
              .sort((a, b) => new Date(b.date) - new Date(a.date))
              .map((j) => <CarteJour key={j.id} j={j} />)}
          </div>
        </details>
      )}

      {slotSel && (() => {
        const ferme = fermSet.has(`${slotSel.date}|${slotSel.heure}`);
        const occ = resaMap[`${slotSel.date}|${slotSel.heure}`] || [];
        const complet = occ.length >= 3;
        const dejaIds = new Set(occ.map((o) => o.sejour_id).filter(Boolean));
        const matches = (sejours || [])
          .filter((s) => {
            const t = `${s.nom_client || ""} ${s.email || ""} ${s.appart_nom || ""}`.toLowerCase();
            return qCli.trim() ? t.includes(qCli.toLowerCase()) : true;
          })
          .slice(0, 8);
        return (
          <div onClick={() => { setSlotSel(null); setQCli(""); setApManuel(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 22, maxWidth: 460, width: "100%", maxHeight: "88vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <b style={{ fontFamily: FONT_TITLE, color: C.blueDk, fontSize: 17 }}>Créneau {slotSel.heure}</b>
                <button onClick={() => { setSlotSel(null); setQCli(""); setApManuel(""); }} style={{ ...btn("#e8eff0"), color: C.muted, width: "auto", padding: "6px 12px" }}>Fermer</button>
              </div>
              <div style={{ fontSize: 13, color: C.muted, textTransform: "capitalize", marginBottom: 14 }}>
                {new Date(slotSel.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · {occ.length}/3
              </div>

              {occ.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {occ.map((o, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: C.bg, borderRadius: 8, marginBottom: 6 }}>
                      <span><b style={{ color: C.blueDk }}>{numApp(o.appart)}</b>{o.client ? <span style={{ color: C.muted }}> · {o.client}</span> : ""}{o.manuel && <span style={{ color: C.gold, fontSize: 11, fontWeight: 700 }}> · saisie manuelle</span>}</span>
                      <button onClick={() => unbook(o.id)} style={{ ...btn("#e8eff0"), color: C.bad, width: "auto", padding: "5px 10px", fontSize: 12 }}>Retirer</button>
                    </div>
                  ))}
                </div>
              )}

              {ferme ? (
                <p style={{ color: C.bad, fontSize: 14 }}>Ce créneau est fermé. Rouvrez-le pour pouvoir réserver.</p>
              ) : complet ? (
                <p style={{ color: C.muted, fontSize: 14 }}>Créneau complet (3/3).</p>
              ) : (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <span style={lbl}>Réserver pour un client</span>
                    <input style={inp} placeholder="Rechercher (nom, email, appartement)…" value={qCli} onChange={(e) => setQCli(e.target.value)} />
                    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                      {matches.length === 0 && <span style={{ fontSize: 13, color: C.muted }}>Aucun séjour trouvé.</span>}
                      {matches.map((s) => (
                        <button key={s.id} disabled={dejaIds.has(s.id)} onClick={() => bookFor(s.id)}
                          style={{ textAlign: "left", padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.line}`, background: dejaIds.has(s.id) ? C.bg : "#fff", cursor: dejaIds.has(s.id) ? "default" : "pointer", fontSize: 13 }}>
                          <b style={{ color: C.blueDk }}>{numApp(s.appart_nom)}</b> · {s.nom_client || s.email}
                          {dejaIds.has(s.id) && <span style={{ color: C.ok, fontWeight: 700 }}> ✓ déjà sur ce créneau</span>}
                        </button>
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: C.muted, margin: "8px 0 0" }}>La réservation remonte automatiquement sur la fiche du séjour.</p>
                  </div>

                  <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, marginBottom: 14 }}>
                    <span style={lbl}>Ou saisir un numéro d'appartement (sans séjour)</span>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <input style={{ ...inp, marginTop: 0, flex: 1 }} placeholder="ex. 509" value={apManuel} onChange={(e) => setApManuel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && bookManuel()} />
                      <button onClick={bookManuel} disabled={!apManuel.trim()} style={{ ...btn(C.gold), width: "auto", padding: "0 16px", opacity: apManuel.trim() ? 1 : .5 }}>Réserver</button>
                    </div>
                    <p style={{ fontSize: 11, color: C.muted, margin: "8px 0 0" }}>Utile si le client n'a pas encore fait son EDL en ligne. Aucune fiche séjour n'est créée.</p>
                  </div>
                </>
              )}

              <button onClick={() => toggleCreneau(slotSel.date, slotSel.heure)}
                style={{ ...btn(ferme ? C.ok : "#e8eff0"), color: ferme ? "#fff" : C.bad, width: "100%", marginTop: 4 }}>
                {ferme ? "Rouvrir ce créneau" : "Fermer ce créneau"}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// date_jour : jour de programmation. UNE activité par jour côté client.
// ---------- GESTION DES ACTIVITÉS (avec upload photo) ----------
// date_jour : jour de programmation. UNE activité par jour côté client.
const VIDE_ACT = { titre: "", description: "", categorie: "", image_url: "", lien: "", actif: true, ordre: 0, date_jour: "" };
function ActivitesAdmin() {
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);
  const [uploading, setUploading] = useState(false);
  const lblStyle = { fontSize: 13, fontWeight: 700, color: C.muted };

  const load = () => adminFn("admin-activites-list").then((r) => setList(r.activites || []));
  useEffect(() => { load(); }, []);

  // Compression + upload vers le bucket public via URL signée
  const uploadPhoto = async (file) => {
    setUploading(true);
    try {
      const blob = await compressImage(file);
      const r = await adminFn("admin-img-upload-url", { ext: "jpg" });
      if (!r.signedUrl) throw new Error(r.error || "URL refusée");
      const up = await fetch(r.signedUrl, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: blob });
      if (!up.ok) throw new Error("Upload échoué");
      setForm((f) => ({ ...f, image_url: r.publicUrl }));
    } catch (e) { alert("Erreur upload : " + e.message); }
    setUploading(false);
  };

  const save = async () => {
    if (!form.titre.trim()) { alert("Titre obligatoire."); return; }
    const r = await adminFn("admin-activite-save", form);
    if (r.ok) { setForm(null); load(); } else alert(r.error);
  };
  const del = async (id) => {
    if (!confirm("Supprimer cette activité ?")) return;
    const r = await adminFn("admin-activite-delete", { id });
    if (r.error) { alert(r.error); return; }
    load();
  };

  if (form) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20, maxWidth: 560 }}>
        <h3 style={{ fontFamily: FONT_TITLE, color: C.blueDk, marginTop: 0 }}>{form.id ? "Modifier" : "Nouvelle"} activité</h3>
        <label style={{ ...lblStyle, display: "block", marginBottom: 10 }}>Titre *
          <input style={inp} value={form.titre || ""} onChange={(e) => setForm({ ...form, titre: e.target.value })} />
        </label>
        <label style={{ ...lblStyle, display: "block", marginBottom: 10 }}>Catégorie
          <input style={inp} value={form.categorie || ""} onChange={(e) => setForm({ ...form, categorie: e.target.value })} placeholder="ex. Randonnée, Famille, Restauration" />
        </label>
        <label style={{ ...lblStyle, display: "block", marginBottom: 10 }}>Date de programmation
          <input style={inp} type="date" value={form.date_jour || ""} onChange={(e) => setForm({ ...form, date_jour: e.target.value })} />
          <span style={{ fontWeight: 400, fontSize: 12, color: C.muted, display: "block", marginTop: 4 }}>Jour où cette activité s'affiche côté client. Laissez vide pour ne pas la programmer.</span>
        </label>
        <label style={{ ...lblStyle, display: "block", marginBottom: 10 }}>Description
          <textarea style={{ ...inp, minHeight: 70 }} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label style={{ ...lblStyle, display: "block", marginBottom: 10 }}>Lien
          <input style={inp} value={form.lien || ""} onChange={(e) => setForm({ ...form, lien: e.target.value })} placeholder="https://…" />
        </label>
        {/* Photo */}
        <div style={{ marginBottom: 14 }}>
          <span style={lblStyle}>Photo</span>
          {form.image_url && <img src={form.image_url} alt="" style={{ display: "block", width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10, margin: "8px 0" }} />}
          <label style={{ ...btn("#e8eff0"), color: C.blue, display: "inline-block", padding: "10px 14px", fontSize: 14, marginTop: 6 }}>
            {uploading ? "Envoi…" : form.image_url ? "Changer la photo" : "Ajouter une photo"}
            <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && uploadPhoto(e.target.files[0])} style={{ display: "none" }} />
          </label>
        </div>
        <label style={{ display: "flex", gap: 8, fontSize: 14, alignItems: "center", margin: "6px 0 16px" }}>
          <input type="checkbox" checked={form.actif !== false} onChange={(e) => setForm({ ...form, actif: e.target.checked })} />
          Visible par les clients
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btn()} onClick={save}>Enregistrer</button>
          <button style={{ ...btn("#e8eff0"), color: C.muted }} onClick={() => setForm(null)}>Annuler</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button style={{ ...btn(), marginBottom: 16 }} onClick={() => setForm({ ...VIDE_ACT })}>+ Nouvelle activité</button>
      {!list ? <p style={{ color: C.muted }}>Chargement…</p>
        : list.length === 0 ? <p style={{ color: C.muted }}>Aucune activité. Cliquez sur « + Nouvelle activité ».</p>
        : <div style={{ display: "grid", gap: 12 }}>
            {list.map((a) => (
              <div key={a.id} style={{ background: C.card, border: `1px solid ${a.actif ? C.line : C.warn}`, borderRadius: 12, padding: 14, display: "flex", gap: 12, alignItems: "center" }}>
                {a.image_url
                  ? <img src={a.image_url} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                  : <div style={{ width: 64, height: 64, borderRadius: 8, background: C.bg, flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, color: a.actif ? C.ok : C.warn, fontWeight: 700 }}>{a.actif ? "● VISIBLE" : "○ MASQUÉE"}</span>
                  <b style={{ color: C.blueDk, display: "block" }}>{a.titre}</b>
                  <span style={{ color: C.muted, fontSize: 13 }}>
                    {a.categorie}
                    {a.date_jour
                      ? <> · <b style={{ color: C.blue }}>{fdate(a.date_jour)}</b></>
                      : <span style={{ color: C.warn }}> · non programmée</span>}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...btn("#e8eff0"), color: C.blue, padding: "6px 10px", fontSize: 13 }} onClick={() => setForm({ ...a, date_jour: a.date_jour || "" })}>Modifier</button>
                  <button style={{ ...btn("#e8eff0"), color: C.bad, padding: "6px 10px", fontSize: 13 }} onClick={() => del(a.id)}>Suppr.</button>
                </div>
              </div>
            ))}
          </div>}
    </div>
  );
}

// Compression image côté client (réutilisée pour les activités ET les promos)
function compressImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1280 / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.75);
    };
    img.src = URL.createObjectURL(file);
  });
}

// ---------- GESTION DES PROMOS PARTENAIRES (avec upload photo) ----------
const VIDE = { partenaire: "", titre: "", description: "", code_promo: "", logo_url: "", image_url: "", lien: "", date_debut: "", date_fin: "", valide: false, ordre: 0 };
function PromosAdmin() {
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null); // null = pas d'édition, sinon objet promo
  const [uploading, setUploading] = useState(false);
  const lblStyle = { fontSize: 13, fontWeight: 700, color: C.muted };

  const load = () => adminFn("admin-promos-list").then((r) => setList(r.promos || []));
  useEffect(() => { load(); }, []);

  // Compression + upload vers le bucket public via URL signée (même Edge Function que les activités)
  const uploadPhoto = async (file) => {
    setUploading(true);
    try {
      const blob = await compressImage(file);
      const r = await adminFn("admin-img-upload-url", { ext: "jpg" });
      if (!r.signedUrl) throw new Error(r.error || "URL refusée");
      const up = await fetch(r.signedUrl, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: blob });
      if (!up.ok) throw new Error("Upload échoué");
      setForm((f) => ({ ...f, image_url: r.publicUrl }));
    } catch (e) { alert("Erreur upload : " + e.message); }
    setUploading(false);
  };

  const save = async () => {
    if (!form.partenaire.trim() || !form.titre.trim()) { alert("Partenaire et titre obligatoires."); return; }
    const r = await adminFn("admin-promo-save", form);
    if (r.ok) { setForm(null); load(); } else alert(r.error);
  };
  const del = async (id) => {
    if (!confirm("Supprimer cette promo ?")) return;
    const r = await adminFn("admin-promo-delete", { id });
    if (r.error) { alert(r.error); return; }
    load();
  };
  const toggleValide = async (p) => {
    await adminFn("admin-promo-save", { ...p, valide: !p.valide }); load();
  };

  const F = (k, label, type = "text") => (
    <label style={{ ...lblStyle, display: "block", marginBottom: 10 }}>{label}
      <input style={inp} type={type} value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </label>
  );

  if (form) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20, maxWidth: 560 }}>
        <h3 style={{ fontFamily: FONT_TITLE, color: C.blueDk, marginTop: 0 }}>{form.id ? "Modifier" : "Nouvelle"} promo</h3>
        {F("partenaire", "Partenaire *")}
        {F("titre", "Titre de l'offre *")}
        <label style={{ ...lblStyle, display: "block", marginBottom: 10 }}>Description
          <textarea style={{ ...inp, minHeight: 70 }} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        {F("code_promo", "Code promo")}
        {F("logo_url", "URL du logo")}
        {/* Photo */}
        <div style={{ marginBottom: 14 }}>
          <span style={lblStyle}>Photo de l'offre</span>
          {form.image_url && <img src={form.image_url} alt="" style={{ display: "block", width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10, margin: "8px 0" }} />}
          <label style={{ ...btn("#e8eff0"), color: C.blue, display: "inline-block", padding: "10px 14px", fontSize: 14, marginTop: 6 }}>
            {uploading ? "Envoi…" : form.image_url ? "Changer la photo" : "Ajouter une photo"}
            <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && uploadPhoto(e.target.files[0])} style={{ display: "none" }} />
          </label>
        </div>
        {F("lien", "Lien (réservation/site)")}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>{F("date_debut", "Début", "date")}</div>
          <div style={{ flex: 1 }}>{F("date_fin", "Fin", "date")}</div>
        </div>
        <label style={{ display: "flex", gap: 8, fontSize: 14, alignItems: "center", margin: "6px 0 16px" }}>
          <input type="checkbox" checked={form.valide} onChange={(e) => setForm({ ...form, valide: e.target.checked })} />
          Validée (visible par les clients)
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btn()} onClick={save}>Enregistrer</button>
          <button style={{ ...btn("#e8eff0"), color: C.muted }} onClick={() => setForm(null)}>Annuler</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button style={{ ...btn(), marginBottom: 16 }} onClick={() => setForm({ ...VIDE })}>+ Nouvelle promo</button>
      {!list ? <p style={{ color: C.muted }}>Chargement…</p>
        : list.length === 0 ? <p style={{ color: C.muted }}>Aucune promo. Cliquez sur « + Nouvelle promo ».</p>
        : <div style={{ display: "grid", gap: 12 }}>
            {list.map((p) => (
              <div key={p.id} style={{ background: C.card, border: `1px solid ${p.valide ? C.ok : C.line}`, borderRadius: 12, padding: 16, display: "flex", gap: 12, alignItems: "center" }}>
                {p.image_url
                  ? <img src={p.image_url} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                  : <div style={{ width: 64, height: 64, borderRadius: 8, background: C.bg, flexShrink: 0 }} />}
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, flex: 1 }}>
                  <div>
                    <span style={{ fontSize: 12, color: p.valide ? C.ok : C.warn, fontWeight: 700 }}>{p.valide ? "● PUBLIÉE" : "○ EN ATTENTE"}</span>
                    <b style={{ color: C.blueDk, display: "block" }}>{p.titre}</b>
                    <span style={{ color: C.muted, fontSize: 13 }}>{p.partenaire}{p.code_promo ? ` · code ${p.code_promo}` : ""}{p.date_fin ? ` · jusqu'au ${fdate(p.date_fin)}` : ""}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "start" }}>
                    <button style={{ ...btn(p.valide ? "#e8eff0" : C.ok), color: p.valide ? C.muted : "#fff", padding: "6px 10px", fontSize: 13 }} onClick={() => toggleValide(p)}>{p.valide ? "Dépublier" : "Publier"}</button>
                    <button style={{ ...btn("#e8eff0"), color: C.blue, padding: "6px 10px", fontSize: 13 }} onClick={() => setForm({ ...p, date_debut: p.date_debut || "", date_fin: p.date_fin || "" })}>Modifier</button>
                    <button style={{ ...btn("#e8eff0"), color: C.bad, padding: "6px 10px", fontSize: 13 }} onClick={() => del(p.id)}>Suppr.</button>
                  </div>
                </div>
              </div>
            ))}
          </div>}
    </div>
  );
}

// ---------- RÉGLAGES : livret d'accueil & infos pratiques ----------
function ReglagesAdmin() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);
  const lbl = { fontSize: 13, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 };

  useEffect(() => { adminFn("admin-config-get").then((r) => setCfg(r.config || {})); }, []);
  if (!cfg) return <p style={{ color: C.muted }}>Chargement…</p>;

  const set = (k, v) => { setCfg({ ...cfg, [k]: v }); setOk(false); };
  const save = async () => {
    setSaving(true); setOk(false);
    const r = await adminFn("admin-config-save", cfg);
    setSaving(false);
    if (r.ok) setOk(true); else alert(r.error || "Erreur");
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
        <h3 style={{ fontFamily: FONT_TITLE, color: C.blueDk, marginTop: 0 }}>Arrivée &amp; infos pratiques</h3>
        <p style={{ color: C.muted, fontSize: 13, marginTop: 0 }}>Ces informations s'affichent sur la page d'accueil (avant identification), utiles pour les arrivées tardives ou autonomes. Laissez un champ vide pour le masquer.</p>

        <label style={lbl}>Lien du livret d'accueil (Canva)</label>
        <input style={inp} value={cfg.livret_url || ""} onChange={(e) => set("livret_url", e.target.value)} placeholder="https://www.canva.com/design/…/view" />
        <p style={{ fontSize: 11, color: C.muted, margin: "4px 0 16px" }}>Dans Canva : Partager → « Toute personne disposant du lien » → Copier le lien.</p>

        <label style={lbl}>Instructions d'arrivée autonome</label>
        <textarea style={{ ...inp, minHeight: 80 }} value={cfg.arrivee_autonome || ""} onChange={(e) => set("arrivee_autonome", e.target.value)} placeholder="Ex. Votre numéro d'appartement vous a été communiqué par email. La clé se trouve dans la boîte à clés à code située…" />
        <div style={{ height: 16 }} />

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Nom du réseau Wifi</label>
            <input style={inp} value={cfg.wifi_nom || ""} onChange={(e) => set("wifi_nom", e.target.value)} placeholder="Cimes-Residence" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Code Wifi</label>
            <input style={inp} value={cfg.wifi_code || ""} onChange={(e) => set("wifi_code", e.target.value)} placeholder="MotDePasse123" />
          </div>
        </div>
        <div style={{ height: 16 }} />

        <label style={lbl}>Urgences &amp; contacts</label>
        <textarea style={{ ...inp, minHeight: 70 }} value={cfg.urgences || ""} onChange={(e) => set("urgences", e.target.value)} placeholder="Réception : 04 92 83 65 59&#10;Urgences médicales : 15&#10;Astreinte résidence : 06 …" />

        <div style={{ height: 20 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button style={{ ...btn(), opacity: saving ? .7 : 1 }} disabled={saving} onClick={save}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
          {ok && <span style={{ color: C.ok, fontWeight: 700, fontSize: 14 }}>✓ Enregistré</span>}
        </div>
      </div>
    </div>
  );
}

// ---------- À RELANCER : séjours terminés sans satisfaction (mailto) ----------
const APP_CLIENT_URL = "https://lescimes.vercel.app";
function RelanceAdmin() {
  const [list, setList] = useState(null);
  const [enCours, setEnCours] = useState(null); // id du séjour en cours de génération
  useEffect(() => { adminFn("admin-sejours-list").then((r) => setList(r.sejours || [])); }, []);
  if (!list) return <p style={{ color: C.muted }}>Chargement…</p>;

  const numApp = (a) => (a || "—").replace(/^Appartement\s+/i, "");
  const auj = jourSejour(new Date().toISOString());
  // Séjours terminés (départ passé) ET sans satisfaction ET avec email valide
  const aRelancer = list.filter((s) => {
    const dep = jourSejour(s.date_depart);
    return dep != null && dep <= auj && !s.satisfaction_faite && emailValide(s.email);
  });
  // Séjours terminés sans satisfaction mais email invalide (ne peuvent pas être relancés par mail)
  const sansEmail = list.filter((s) => {
    const dep = jourSejour(s.date_depart);
    return dep != null && dep <= auj && !s.satisfaction_faite && !emailValide(s.email);
  });

  const relancer = async (s) => {
    setEnCours(s.id);
    const r = await adminFn("admin-relance-link", { sejour_id: s.id });
    setEnCours(null);
    // Lien court auto-connecté si le code est généré, sinon lien simple (repli)
    const lien = r.code ? `${APP_CLIENT_URL}/r/${r.code}` : APP_CLIENT_URL;
    const sujet = "Votre avis sur votre séjour aux Cimes du Val d'Allos";
    const corps =
`Bonjour${s.nom_client ? " " + s.nom_client : ""},

Nous espérons que votre séjour aux Cimes du Val d'Allos s'est bien passé.

Votre avis nous est précieux : il ne vous prendra qu'une minute et nous aide à améliorer la résidence. Cliquez simplement sur ce lien pour y répondre directement :
${lien}

Merci beaucoup, et au plaisir de vous accueillir à nouveau.

L'équipe des Cimes du Val d'Allos`;
    window.location.href = `mailto:${encodeURIComponent(s.email)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  };

  return (
    <div>
      <div style={{ background: "#e8f1f2", borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: C.blueDk }}>
        Séjours <b>terminés</b> dont l'enquête de satisfaction n'a pas été remplie. Cliquez « Relancer » : un email pré-rempli s'ouvre, avec un lien qui identifie le client automatiquement et l'amène directement sur l'enquête.
      </div>

      {aRelancer.length === 0
        ? <p style={{ color: C.muted }}>Aucun séjour à relancer. 👍</p>
        : <div style={{ overflowX: "auto", background: C.card, border: `1px solid ${C.line}`, borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{["Appart", "Client", "Email", "Départ", ""].map((h, i) =>
                <th key={i} style={{ textAlign: "left", padding: 10, color: C.muted, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>{aRelancer.map((s) => (
                <tr key={s.id}>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}`, fontWeight: 700, color: C.blueDk }}>{numApp(s.appart_nom)}</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>{s.nom_client || "—"}</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>{s.email}</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>{s.date_depart ? fdate(s.date_depart) : "—"}</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>
                    <button onClick={() => relancer(s)} disabled={enCours === s.id} style={{ ...btn(C.gold), padding: "6px 12px", fontSize: 13, opacity: enCours === s.id ? .6 : 1 }}>{enCours === s.id ? "Génération…" : "Relancer"}</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>}

      {sansEmail.length > 0 && (
        <details style={{ marginTop: 18 }}>
          <summary style={{ cursor: "pointer", color: C.muted, fontSize: 14 }}>
            {sansEmail.length} séjour{sansEmail.length > 1 ? "s" : ""} terminé{sansEmail.length > 1 ? "s" : ""} sans email valide (non relançable{sansEmail.length > 1 ? "s" : ""})
          </summary>
          <div style={{ marginTop: 10, fontSize: 13, color: C.muted }}>
            {sansEmail.map((s) => (
              <div key={s.id} style={{ padding: "6px 0", borderBottom: `1px solid ${C.bg}` }}>
                <b style={{ color: C.blueDk }}>{numApp(s.appart_nom)}</b> · {s.nom_client || "—"} · {s.email || "email manquant"}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
