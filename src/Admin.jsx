import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// =====================================================================
// CONFIG — clés PUBLIQUES (anon) : OK ici, Auth seulement. Les données
// passent par les Edge Functions qui vérifient le rôle admin.
// =====================================================================
const SUPABASE_URL = "https://TON-PROJET.supabase.co";
const SUPABASE_ANON = "TON_ANON_KEY"; // anon = login uniquement, aucune table lisible
const FN = `${SUPABASE_URL}/functions/v1`;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

const C = {
  blue: "#0f5b6b", blueDk: "#0a4350", blue2: "#13708a", gold: "#f2a65a",
  bg: "#f1f6f7", card: "#fff", text: "#13343b", muted: "#5d7a81",
  line: "#dceaed", bad: "#d9534f", warn: "#d98736", ok: "#3fa34d",
};
const FONT_TITLE = "'Archivo Black',sans-serif";
const FONT_BODY = "'Plus Jakarta Sans',system-ui,sans-serif";

// appel d'une function admin avec le JWT de session
async function adminFn(name, body = {}) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(`${FN}/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body),
  });
  return r.json();
}

export default function Admin() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    if (!document.getElementById("glacier-fonts")) {
      const l = document.createElement("link");
      l.id = "glacier-fonts"; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";
      document.head.appendChild(l);
    }
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <Center>Chargement…</Center>;
  if (!session) return <Login />;
  return <Dashboard onLogout={() => sb.auth.signOut()} />;
}

const Center = ({ children }) => (
  <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", color: C.text }}>{children}</div>
);
const inp = { width: "100%", padding: "11px 12px", border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 15, boxSizing: "border-box", marginTop: 6 };
const btn = (bg = C.blue) => ({ background: bg, color: "#fff", border: 0, borderRadius: 10, padding: "12px 18px", fontWeight: 700, cursor: "pointer", fontSize: 15 });

// ---------- LOGIN ----------
function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const login = async () => {
    setErr("");
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) setErr(error.message);
  };
  return (
    <Center>
      <div style={{ width: 360, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 24 }}>
        <h2 style={{ color: C.blueDk, marginTop: 0, fontFamily: FONT_TITLE, letterSpacing: "-.4px" }}>Administration</h2>
        <p style={{ color: C.muted, marginTop: 0, fontSize: 14 }}>Les Cimes du Val d'Allos</p>
        <input style={inp} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div style={{ height: 10 }} />
        <input style={inp} type="password" placeholder="Mot de passe" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
        {err && <p style={{ color: C.bad, fontSize: 14 }}>{err}</p>}
        <div style={{ height: 14 }} />
        <button style={{ ...btn(), width: "100%" }} onClick={login}>Se connecter</button>
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
      <div style={{ display: "flex", gap: 4, padding: "0 20px", borderBottom: `1px solid ${C.line}` }}>
        {[["overview", "Vue d'ensemble"], ["kpi", "Indicateurs"], ["sejours", "Séjours"], ["satis", "Satisfaction"], ["mid", "Mi-séjour"], ["inc", "Incidents"], ["promos", "Promos"], ["activites", "Activités"]].map(([key, l]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: "10px 16px", border: 0, background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
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

        {tab === "satis" && (
          <div style={{ overflowX: "auto", background: C.card, border: `1px solid ${C.line}`, borderRadius: 12 }}>
            {(data?.satisfaction || []).length === 0
              ? <p style={{ color: C.muted, padding: 16 }}>Aucune réponse post-séjour.</p>
              : <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr>{["Date", "Client", "Appart", "Accueil", "Propr.", "Équip.", "Literie", "Q/P", "NPS", "Apprécié", "À améliorer", "EDL"].map((h, i) =>
                    <th key={i} style={{ textAlign: "left", padding: 10, color: C.muted, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                  <tbody>{(data?.satisfaction || []).map((s, i) => (
                    <tr key={i}>
                      {[fdate(s.created_at), s._client, s._appart, s.note_accueil, s.note_proprete, s.note_equipements, s.note_literie, s.note_qualite_prix, s.nps, s.point_positif || "—", s.point_amelioration || "—"].map((c, j) =>
                        <td key={j} style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>{c}</td>)}
                      <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>
                        <button onClick={() => voirPhotos(s.sejour_id, s._client)} style={{ ...btn("#eef5f6"), color: C.blue, padding: "4px 10px", fontSize: 12 }}>📷</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>}
          </div>
        )}

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
        {tab === "activites" && <ActivitesAdmin />}
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

  const filtered = (list || []).filter((s) =>
    !q || (s.nom_client || "").toLowerCase().includes(q.toLowerCase())
       || (s.email || "").toLowerCase().includes(q.toLowerCase())
       || (s.appart_nom || "").toLowerCase().includes(q.toLowerCase()));

  if (!list) return <p style={{ color: C.muted }}>Chargement…</p>;
  return (
    <div>
      <input style={{ ...inp, maxWidth: 360, marginBottom: 16 }} placeholder="Rechercher (nom, email, appartement)…" value={q} onChange={(e) => setQ(e.target.value)} />
      {filtered.length === 0 ? <p style={{ color: C.muted }}>Aucun séjour.</p>
        : <div style={{ overflowX: "auto", background: C.card, border: `1px solid ${C.line}`, borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{["Client", "Email", "Arrivée", "Départ", "Appartement", "Fiche", "Réaffecter à"].map((h, i) =>
                <th key={i} style={{ textAlign: "left", padding: 10, color: C.muted, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>{filtered.map((s) => (
                <tr key={s.id}>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>{s.nom_client}</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>{s.email}</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>{fdate(s.date_arrivee)}</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>{s.date_depart ? fdate(s.date_depart) : "—"}</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}`, fontWeight: 700 }}>{s.appart_nom || "—"}</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>
                    <button style={{ ...btn(C.blue), padding: "4px 10px", fontSize: 12 }} onClick={() => openFiche(s.id)}>Voir</button>
                  </td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${C.bg}` }}>
                    <select defaultValue="" onChange={(e) => reaffect(s.id, e.target.value)}
                      style={{ ...inp, width: 180, marginTop: 0 }}>
                      <option value="">— Changer —</option>
                      {(apparts || []).map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                    </select>
                  </td>
                </tr>
              ))}</tbody>
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

// ---------- GESTION DES ACTIVITÉS (avec upload photo) ----------
const VIDE_ACT = { titre: "", description: "", categorie: "", image_url: "", lien: "", actif: true, ordre: 0 };
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
  const del = async (id) => { if (confirm("Supprimer cette activité ?")) { await adminFn("admin-activite-delete", { id }); load(); } };

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
                  <span style={{ color: C.muted, fontSize: 13 }}>{a.categorie}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...btn("#e8eff0"), color: C.blue, padding: "6px 10px", fontSize: 13 }} onClick={() => setForm({ ...a })}>Modifier</button>
                  <button style={{ ...btn("#e8eff0"), color: C.bad, padding: "6px 10px", fontSize: 13 }} onClick={() => del(a.id)}>Suppr.</button>
                </div>
              </div>
            ))}
          </div>}
    </div>
  );
}

// Compression image côté client (réutilisée pour les activités)
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

// ---------- GESTION DES PROMOS PARTENAIRES ----------
const VIDE = { partenaire: "", titre: "", description: "", code_promo: "", logo_url: "", lien: "", date_debut: "", date_fin: "", valide: false, ordre: 0 };
function PromosAdmin() {
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null); // null = pas d'édition, sinon objet promo
  const lblStyle = { fontSize: 13, fontWeight: 700, color: C.muted };

  const load = () => adminFn("admin-promos-list").then((r) => setList(r.promos || []));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.partenaire.trim() || !form.titre.trim()) { alert("Partenaire et titre obligatoires."); return; }
    const r = await adminFn("admin-promo-save", form);
    if (r.ok) { setForm(null); load(); } else alert(r.error);
  };
  const del = async (id) => {
    if (!confirm("Supprimer cette promo ?")) return;
    await adminFn("admin-promo-delete", { id }); load();
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
              <div key={p.id} style={{ background: C.card, border: `1px solid ${p.valide ? C.ok : C.line}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
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
