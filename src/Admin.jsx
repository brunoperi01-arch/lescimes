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
  const [tab, setTab] = useState("kpi");
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
        {[["kpi", "Indicateurs"], ["satis", "Satisfaction"], ["mid", "Mi-séjour"], ["inc", "Incidents"]].map(([key, l]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: "10px 16px", border: 0, background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
            fontWeight: tab === key ? 800 : 500, color: tab === key ? C.blue : C.muted, borderBottom: tab === key ? `3px solid ${C.blue}` : "3px solid transparent" }}>
            {l}
            {key === "inc" && nbNouveaux > 0 &&
              <span style={{ background: C.bad, color: "#fff", borderRadius: 999, fontSize: 11, fontWeight: 700, minWidth: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{nbNouveaux}</span>}
          </button>
        ))}
      </div>

      <main style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
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

        {tab === "inc" && (
          <div style={{ display: "grid", gap: 12 }}>
            {(data?.incidents || []).length === 0 && <p style={{ color: C.muted }}>Aucun incident.</p>}
            {(data?.incidents || []).map((i) => (
              <div key={i.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <b style={{ color: C.blueDk }}>{i.categorie}</b>
                    <span style={{ color: C.muted, fontSize: 13 }}> · {i._client} · {i._appart} · {fdate(i.created_at)}</span>
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
        )}
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
