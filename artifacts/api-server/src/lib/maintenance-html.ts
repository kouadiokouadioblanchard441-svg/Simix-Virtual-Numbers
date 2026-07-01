export const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Simix — Maintenance</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100dvh;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;overflow-x:hidden}
    .hero{width:100%;max-width:480px;aspect-ratio:1/1;overflow:hidden;flex-shrink:0}
    .hero img{width:100%;height:200%;object-fit:cover;object-position:top center;display:block}
    .card{width:100%;max-width:480px;padding:0 24px 48px;display:flex;flex-direction:column}
    h1{color:#DC2626;font-weight:800;font-size:clamp(18px,5vw,22px);text-align:center;margin:0 0 12px;line-height:1.35}
    .sub{color:#6B7280;font-size:clamp(13px,3.5vw,15px);text-align:center;margin:0 0 28px;line-height:1.6}
    .divider{height:1px;background:#E5E7EB;margin-bottom:24px}
    .row{display:flex;align-items:center;gap:10px;margin-bottom:18px}
    .badge{background:#DC2626;color:#fff;font-weight:700;font-size:13px;letter-spacing:.06em;padding:4px 14px;border-radius:999px;text-transform:uppercase}
    .row2{display:flex;align-items:center;gap:10px;margin-bottom:20px}
    .icon-wrap{width:32px;height:32px;border-radius:50%;border:2px solid #D1D5DB;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .est{color:#374151;font-size:14px}
    .est strong{color:#DC2626;font-weight:700}
    .contact{border:1px solid #E5E7EB;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:14px;margin-bottom:28px;background:#FAFAFA}
    .mail-icon{width:38px;height:38px;border-radius:50%;border:2px solid #BFDBFE;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:#EFF6FF}
    .contact-label{color:#6B7280;font-size:12px;margin-bottom:3px}
    .contact a{color:#2563EB;font-weight:700;font-size:14px;text-decoration:none}
    .btn{width:100%;background:#1D4ED8;color:#fff;font-weight:700;font-size:16px;border:none;border-radius:14px;padding:16px 24px;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;letter-spacing:.01em;-webkit-tap-highlight-color:transparent}
    .btn:hover{background:#1E40AF}
    .btn:active{background:#1E3A8A;transform:scale(.99)}
    @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <div class="hero">
    <img src="/maintenance-hero.png" alt="Maintenance" onerror="this.style.display='none'"/>
  </div>
  <div class="card">
    <h1>Le site est actuellement en maintenance.</h1>
    <p class="sub">Nous travaillons à améliorer votre expérience.<br>Veuillez réessayer dans quelques instants.</p>
    <div class="divider"></div>
    <div class="row">
      <span style="font-weight:700;color:#111827;font-size:15px">Statut :</span>
      <span class="badge">Maintenance</span>
    </div>
    <div class="row2">
      <span class="icon-wrap">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </span>
      <span class="est">Temps estimé : <strong>Bientôt disponible</strong></span>
    </div>
    <div class="contact">
      <span class="mail-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,14 22,4"/></svg>
      </span>
      <div>
        <div class="contact-label">Pour toute information, contactez-nous :</div>
        <a href="mailto:support@simix.site">support@simix.site</a>
      </div>
    </div>
    <button class="btn" id="btn" onclick="retry()">
      <svg id="ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
      <span id="lbl">Réessayer plus tard</span>
    </button>
  </div>
  <script>
    function retry(){
      document.getElementById('lbl').textContent='Vérification\u2026';
      document.getElementById('ico').style.animation='spin 1s linear infinite';
      document.getElementById('btn').disabled=true;
      setTimeout(()=>location.reload(),1000);
    }
    /* Poll every 15s — reload automatically when maintenance is lifted */
    setInterval(async()=>{
      try{
        const r=await fetch('/api/maintenance/status',{cache:'no-store'});
        const d=await r.json();
        if(!d.active) location.reload();
      }catch(e){}
    },15000);
  </script>
</body>
</html>`;
