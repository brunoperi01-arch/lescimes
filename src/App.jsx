import { useState, useEffect, useRef } from "react";

// =====================================================================
// CONFIG — renseigne l'URL de tes Edge Functions Supabase
// =====================================================================
const FN = "https://TON-PROJET.supabase.co/functions/v1";
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

export default function App() {
  useGlacierFonts();
  const [token, setToken] = useState(null);
  const [tab, setTab] = useState("edl");

  if (!token) return <Identify onAuth={setToken} />;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", color: C.text }}>
      <header style={{ background: C.blueDk, color: "#fff", padding: "18px 16px" }}>
        <div style={{ fontFamily: FONT_TITLE, fontSize: 18, letterSpacing: "-.3px" }}>Les Cimes du Val d'Allos</div>
        <div style={{ opacity: .85, fontSize: 13 }}>Espace client de votre séjour</div>
      </header>

      <nav style={{ display: "flex", background: C.card, borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, zIndex: 5 }}>
        {[["edl", "État des lieux"], ["incident", "Un souci ?"], ["midstay", "Mi-séjour"], ["satis", "Satisfaction"], ["activites", "Activités"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ flex: 1, padding: "12px 4px", border: 0, background: "none", cursor: "pointer",
              fontWeight: tab === k ? 800 : 500, color: tab === k ? C.blue : C.muted,
              borderBottom: tab === k ? `3px solid ${C.blue}` : "3px solid transparent", fontSize: 13 }}>
            {l}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: 16 }}>
        {tab === "edl" && <EDL token={token} />}
        {tab === "incident" && <Incident token={token} />}
        {tab === "midstay" && <MidStay token={token} />}
        {tab === "satis" && <Satisfaction token={token} />}
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
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>
      <div style={{ maxWidth: 420, width: "100%" }}>
        <h1 style={{ fontFamily: FONT_TITLE, color: C.blueDk, fontSize: 24, marginBottom: 4, letterSpacing: "-.5px" }}>Bienvenue</h1>
        <p style={{ color: C.muted, marginTop: 0 }}>Renseignez votre séjour pour accéder à votre espace.</p>
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
      </div>
    </div>
  );
}

// =====================================================================
// MODULE 1 — ÉTAT DES LIEUX
// =====================================================================
function EDL({ token }) {
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
    setSending(true);
    const signature = sigRef.current?.toDataURL?.() || null;
    const r = await post("submit-edl", { token, type, rempli_par: par, signature, commentaire_general: gen, pieces });
    setSending(false);
    if (r.ok) { setEdlId(r.edl_id); setDone(true); } else alert(r.error);
  };

  // Écran final (confirmation / photos)
  if (done && !PHOTOS_EDL) return (
    <Card><b style={{ color: C.ok, fontSize: 18 }}>✓ État des lieux enregistré</b>
      <p style={{ color: C.muted, marginBottom: 0 }}>Merci. Une copie reste consultable par la résidence.</p></Card>
  );
  if (done) return (
    <>
      <Card><b style={{ color: C.ok, fontSize: 18 }}>✓ État des lieux enregistré</b>
        <p style={{ color: C.muted, marginBottom: 0 }}>Ajoutez des photos par pièce (optionnel mais recommandé).</p></Card>
      {pieces.map((p, i) => (
        <Card key={i}><b>{p.piece}</b><PhotoUpload token={token} edlId={edlId} piece={p.piece} /></Card>
      ))}
      <Card><p style={{ color: C.muted, margin: 0, fontSize: 14 }}>Vos photos sont enregistrées au fur et à mesure.</p></Card>
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

  // ÉTAPE 0 : intro (type + rempli par)
  if (step === 0) return (
    <>
      <Progress />
      <Card>
        <span style={label}>Type d'état des lieux</span>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          {[["entree", "Entrée"], ["sortie", "Sortie"]].map(([k, l]) => (
            <button key={k} onClick={() => setType(k)} style={{ ...navBtn(type === k ? C.blue : "#eef5f6", type === k ? "#fff" : C.muted) }}>{l}</button>
          ))}
        </div>
        <div style={{ height: 16 }} />
        <label style={label}>Rempli par
          <select style={{ ...inp, minHeight: 50 }} value={par} onChange={(e) => setPar(e.target.value)}>
            <option value="client">Le client</option>
            <option value="staff">Avec le personnel</option>
          </select>
        </label>
        <div style={{ height: 18 }} />
        <button style={navBtn(C.blue, "#fff")} onClick={() => setStep(1)}>Commencer →</button>
      </Card>
    </>
  );

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
            {[["bon", "Bon état", C.ok], ["moyen", "État moyen", C.gold], ["mauvais", "Mauvais état", C.bad]].map(([k, l, col]) => (
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
// MODULE 3a — MID-STAY (enquête courte pendant le séjour)
// =====================================================================
function MidStay({ token }) {
  const Q = [
    ["logement_ok", "Le logement correspond à vos attentes ?"],
    ["equipements_ok", "Les équipements fonctionnent correctement ?"],
    ["proprete_ok", "La propreté est satisfaisante ?"],
  ];
  const [rep, setRep] = useState({});
  const [com, setCom] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async () => {
    const r = await post("submit-midstay", { token, ...rep, commentaire: com });
    if (r.ok) setSent(true); else alert(r.error);
  };
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
// MODULE 3b — SATISFACTION POST-SÉJOUR (100% INTERNE, critères 1-5 + NPS)
// =====================================================================
function Satisfaction({ token }) {
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
    const r = await post("submit-satisfaction", {
      token, ...notes, nps, point_positif: pos, point_amelioration: amel,
    });
    if (r.ok) setSent(true); else alert(r.error);
  };
  if (sent) return <Card><b style={{ color: C.ok }}>✓ Merci pour votre retour.</b><p style={{ color: C.muted }}>Vos réponses nous aident à améliorer la résidence.</p></Card>;

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
  const [list, setList] = useState(null);
  const [promos, setPromos] = useState(null);
  useEffect(() => {
    post("get-activites", {}).then((r) => setList(r.activites || []));
    post("get-promos", {}).then((r) => setPromos(r.promos || []));
  }, []);
  if (!list) return <Card>Chargement…</Card>;
  return (
    <>
      {/* Offres des partenaires */}
      {promos && promos.length > 0 && (
        <>
          <h3 style={{ fontFamily: FONT_TITLE, color: C.blueDk, fontSize: 16, letterSpacing: "-.3px", margin: "4px 0 10px" }}>Offres de nos partenaires</h3>
          {promos.map((p, i) => (
            <Card key={`promo-${i}`} style={{ padding: 0, overflow: "hidden", borderColor: C.gold }}>
              <div style={{ padding: 16 }}>
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
              </div>
            </Card>
          ))}
          <div style={{ height: 18 }} />
        </>
      )}

      {/* Activités éditoriales */}
      {list.length > 0 && (
        <h3 style={{ fontFamily: FONT_TITLE, color: C.blueDk, fontSize: 16, letterSpacing: "-.3px", margin: "4px 0 10px" }}>À faire dans la vallée</h3>
      )}
      {list.length === 0 && (!promos || promos.length === 0) && <Card style={{ color: C.muted }}>Aucune activité publiée pour le moment.</Card>}
      {list.map((a, i) => (
        <Card key={i} style={{ padding: 0, overflow: "hidden" }}>
          {a.image_url && <img src={a.image_url} alt={a.titre} style={{ width: "100%", height: 150, objectFit: "cover" }} />}
          <div style={{ padding: 16 }}>
            {a.categorie && <span style={{ fontSize: 12, color: C.blue, fontWeight: 700 }}>{a.categorie}</span>}
            <h3 style={{ margin: "4px 0", color: C.blueDk, fontFamily: FONT_TITLE, fontSize: 16, letterSpacing: "-.3px" }}>{a.titre}</h3>
            <p style={{ color: C.muted, fontSize: 14, marginTop: 0 }}>{a.description}</p>
            {a.lien && <a href={a.lien} target="_blank" rel="noreferrer" style={{ color: C.gold, fontWeight: 700, fontSize: 14 }}>En savoir plus →</a>}
          </div>
        </Card>
      ))}
    </>
  );
}
