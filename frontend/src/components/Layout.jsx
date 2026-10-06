import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePreferences } from "../context/PreferencesContext";
import { useTracking } from "../context/TrackingContext";

function LocationPrompt() {
  const [choice, setChoice] = useState(() => localStorage.getItem("busbest_location_choice"));
  const [error, setError] = useState("");
  const [reopen, setReopen] = useState(false);
  const { t } = usePreferences();
  function remember(value, problem = "") { localStorage.setItem("busbest_location_choice", value); setChoice(value); setReopen(false); setError(problem); }
  function allow() {
    if (!navigator.geolocation) { remember("unavailable", "This browser does not provide device location."); return; }
    navigator.geolocation.getCurrentPosition(() => remember("allowed"), (reason) => remember("denied", reason.message || "Location permission was not granted."), { maximumAge: 0, timeout: 12000 });
  }
  if (choice && !reopen) return <div className="location-capability"><span className={choice === "allowed" ? "health-dot health-dot--good" : "health-dot"} />{error || (choice === "allowed" ? t("locationReady") : t("declined"))}<button className="text-link" onClick={() => { setError(""); setReopen(true); }}>{t("locationSettings")}</button></div>;
  return <section className="location-prompt" role="region" aria-labelledby="location-title"><div className="location-prompt-icon">⌖</div><div><p className="eyebrow">LOCATION PERMISSION</p><h2 id="location-title">{t("enableTitle")}</h2><p>{t("locationHelp")}</p></div><div className="location-prompt-actions"><button className="button button--orange" onClick={allow}>{t("allow")}</button><button className="button button--outline" onClick={() => remember("deferred")}>{t("notNow")}</button></div></section>;
}

function PreferenceControls() {
  const { theme, setTheme, language, setLanguage, t } = usePreferences();
  return <details className="preference-menu"><summary aria-label="Display settings">Aa</summary><div className="preference-panel"><label>{t("theme")}<select value={theme} onChange={(event) => setTheme(event.target.value)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label>{t("language")}<select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="en">English</option><option value="ml">മലയാളം</option><option value="hi">हिन्दी</option></select></label></div></details>;
}

export function SiteLayout() {
  const { user, logout } = useAuth();
  const { t } = usePreferences();
  const tracking = useTracking();
  async function signOut() { if (tracking.session) await tracking.stop(); logout(); }
  return <>
    <LocationPrompt />
    <header className="topbar">
      <Link to="/" className="brand" aria-label="BUSBEST home"><span className="brand-mark">B</span><span>BUSBEST<small>Move with clarity</small></span></Link>
      <nav className="topnav" aria-label="Main navigation">
        <NavLink to="/" end>{t("map")}</NavLink><NavLink to="/about">{t("about")}</NavLink>
        {user && <NavLink to={user.role === "ADMIN" ? "/admin" : "/dashboard"}>{t("dashboard")}</NavLink>}
        {user?.role === "USER" && <NavLink to="/my-buses">{t("myBuses")}</NavLink>}
        {user?.role === "ADMIN" && <NavLink to="/admin/users">Admin</NavLink>}
      </nav>
      <div className="top-actions">
        <PreferenceControls />
        {tracking.session && <div className="tracking-chip"><span className="live-indicator" />{tracking.sharing ? `${t("active")} · ${tracking.session.bus_id}` : `${t("sessionActive")} · ${tracking.session.bus_id}`}<button className="button button--danger-quiet button--small" onClick={tracking.sharing ? tracking.stop : tracking.resume}>{tracking.sharing ? t("stop") : t("resumeSharing")}</button>{tracking.error && <span className="tracking-inline-error" role="alert">{tracking.error}</span>}</div>}
        {user ? <><Link className="avatar-link" to="/profile"><span className="avatar">{user.name?.slice(0, 1).toUpperCase()}</span><span className="user-name">{user.name}</span></Link><button className="button button--quiet button--small" onClick={signOut}>{t("signOut")}</button></> : <><Link className="text-link" to="/login">{t("signIn")}</Link><Link className="button button--dark button--small" to="/register">{t("join")} <span aria-hidden="true">↗</span></Link></>}
      </div>
      <details className="mobile-menu"><summary aria-label="Open navigation">☰</summary><div className="mobile-menu-panel"><NavLink to="/">{t("map")}</NavLink><NavLink to="/about">{t("about")}</NavLink>{user && <NavLink to={user.role === "ADMIN" ? "/admin" : "/dashboard"}>{t("dashboard")}</NavLink>}{user?.role === "USER" && <NavLink to="/my-buses">{t("myBuses")}</NavLink>}{user?.role === "ADMIN" && <NavLink to="/admin/users">Admin</NavLink>}{user ? <><NavLink to="/profile">{t("profile")}</NavLink><button className="mobile-signout" onClick={signOut}>{t("signOut")}</button></> : <><NavLink to="/login">{t("signIn")}</NavLink><NavLink to="/register">{t("join")}</NavLink></>}</div></details>
    </header>
    <main className="site-main"><Outlet /></main>
    <footer className="site-footer"><Link to="/" className="footer-brand">BUSBEST</Link><span>Community powered transit clarity.</span><span className="demo-chip">SIMULATED DEMO DATA</span><Link to="/about">About the project</Link></footer>
  </>;
}

export function PageHeading({ eyebrow, title, description, action }) { return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action && <div className="page-heading-action">{action}</div>}</div>; }
export function StatCard({ label, value, detail, accent = false }) { return <article className={`stat-card${accent ? " stat-card--accent" : ""}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>; }
export function Loading({ label = "Loading BUSBEST data" }) { return <div className="loading-state"><span className="spinner" />{label}</div>; }
export function ErrorPanel({ error, onRetry }) { return <div className="error-panel" role="alert"><span className="error-symbol">!</span><div><strong>We couldn't load this view.</strong><p>{error?.message || "Please try again."}</p></div>{onRetry && <button className="button button--outline button--small" onClick={onRetry}>Retry</button>}</div>; }
export function EmptyState({ title, text, action }) { return <div className="empty-state"><span className="empty-icon">↗</span><h3>{title}</h3><p>{text}</p>{action}</div>; }
export function RoleOutlet({ children }) { return children; }
