import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { http } from "../api";
import { useAuth } from "../context/AuthContext";
import { useData } from "../hooks";
import { useLiveBuses } from "../useLiveBuses";
import { useTracking } from "../context/TrackingContext";
import { usePreferences } from "../context/PreferencesContext";
import BusMap from "../components/BusMap";
import { BusCard, TrafficPill, TrackingStatus } from "../components/BusCard";
import { EmptyState, ErrorPanel, Loading, PageHeading, StatCard } from "../components/Layout";

export function HomePage() {
  const live = useLiveBuses();
  const { t } = usePreferences();
  const [query, setQuery] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("ALL");
  const liveBuses = live.data?.buses || [];
  const routesList = live.data?.routes || [];
  const visible = useMemo(() => liveBuses.filter((bus) => {
    const route = routesList.find((item) => item.route_id === bus.route_id);
    const queryMatch = `${bus.bus_id} ${bus.route_id} ${bus.route_label || ""} ${route?.name || ""}`.toLowerCase().includes(query.trim().toLowerCase());
    return queryMatch && (selectedRoute === "ALL" || bus.route_id === selectedRoute);
  }), [liveBuses, routesList, query, selectedRoute]);
  const trafficCount = liveBuses.filter((bus) => bus.traffic_level === "HEAVY").length;
  const loading = live.loading;
  const error = live.error;

  return <>
    <section className="hero container">
      <div className="hero-copy"><p className="eyebrow"><span className="eyebrow-dot" /> YOUR CITY, IN MOTION</p><h1>Make every<br /><em>minute</em> count.</h1><p className="hero-lede">See where your bus is, understand the traffic ahead, and make your next move with confidence.</p><div className="hero-actions"><a className="button button--orange" href="#live-map">Explore live map <span>↓</span></a><Link className="button button--outline" to="/about">How BUSBEST works</Link></div><p className="demo-notice"><span>●</span> SIMULATED DEMO DATA · Local college demonstration</p></div>
      <div className="hero-art" aria-hidden="true"><div className="orbit orbit--one" /><div className="orbit orbit--two" /><div className="hero-coordinate hero-coordinate--one">09° 35′ N<br />76° 31′ E</div><div className="hero-coordinate hero-coordinate--two">LIVE ROUTE<br /><b>01 — 05</b></div><div className="sun-disc" /><div className="hero-road"><span /><span /></div><div className="bus-illustration"><div className="bus-window" /><div className="bus-window bus-window--two" /><div className="bus-light" /><i /><i /></div><div className="hero-pin">●<span>BUS 101</span></div></div>
    </section>

    <section className="stats-strip container" aria-label="Current overview">
      <StatCard label="BUSES ON THE MAP" value={loading ? "—" : liveBuses.length} detail="Latest HBase states" />
      <StatCard label="ROUTES COVERED" value={loading ? "—" : routesList.length} detail="Distinct routes in current data" />
      <StatCard label="TRAFFIC ALERTS" value={loading ? "—" : trafficCount} detail="Heavy traffic classifications" accent />
      <div className="stats-caption"><span className="live-indicator" /> Updated from the local data pipeline<br /><small>Times shown in your local timezone</small></div>
    </section>

    <section className="map-section container" id="live-map">
      <div className="section-head"><div><p className="eyebrow">THE NETWORK</p><h2>Every route,<br /><em>one view.</em></h2></div><p>Bus locations and traffic status from the BUSBEST API. The current records are simulated for demonstration.</p></div>
      <div className="map-toolbar"><div className="search-wrap"><span aria-hidden="true">⌕</span><input aria-label={t("search")} placeholder={t("search")} value={query} onChange={(event) => setQuery(event.target.value)} /></div><label className="select-wrap"><span className="sr-only">Filter by route</span><select value={selectedRoute} onChange={(event) => setSelectedRoute(event.target.value)}><option value="ALL">{t("allRoutes")}</option>{routesList.map((route) => <option key={route.route_id} value={route.route_id}>{route.route_id}</option>)}</select></label><Link className="text-link" to="/about">Data details ↗</Link></div>
      {error ? <ErrorPanel error={error} onRetry={live.reload} /> : loading ? <div className="map-loading"><Loading label="Loading latest bus state" /></div> : <div className="map-layout"><div className="map-canvas"><BusMap buses={visible} routes={routesList} /><div className="map-label"><span className="live-indicator" /> BUS STATE FEED · WEBSOCKET</div><div className="map-scale">OpenStreetMap © contributors</div></div><aside className="bus-list"><div className="bus-list-head"><div><strong>{t("currentBuses")}</strong><span>{visible.length} buses in current results</span></div><span className="count-badge">{visible.length}</span></div>{visible.length ? visible.map((bus) => <BusCard key={bus.bus_id} bus={bus} />) : <EmptyState title="No buses found" text="Try another bus ID or route." />}</aside></div>}
      <div className="source-note"><span>i</span><p>Each bus shows its actual data source. Prepared records remain SIMULATED DEMO DATA; recent passenger signals are labeled LIVE CROWD TELEMETRY.</p></div>
      <div className="route-directory"><p className="eyebrow">{t("routes")} · {t("stops")}</p>{routesList.map((route) => <Link className="route-chip" key={route.route_id} to={`/routes/${encodeURIComponent(route.route_id)}`}><b>{route.route_id}</b><span>{route.name}</span><small>{route.stops?.length || 0} {t("stops")} ↗</small></Link>)}</div>
    </section>

    <section className="how-section container"><div><p className="eyebrow">A CLEARER COMMUTE</p><h2>From signal<br />to <em>arrival.</em></h2><p>BUSBEST brings the data journey into one place — from consent-led location contributions to useful travel estimates.</p><Link to="/about" className="arrow-link">Explore the project <span>↗</span></Link></div><div className="steps-grid"><article><span>01</span><b>Contribute</b><p>Participate only when you choose to share a location observation.</p></article><article><span>02</span><b>Understand</b><p>Traffic labels and ETA use clear thresholds and available history.</p></article><article><span>03</span><b>Plan</b><p>Use the latest bus state and route information to decide what’s next.</p></article></div></section>
  </>;
}

export function AboutPage() {
  return <section className="container content-page"><PageHeading eyebrow="ABOUT THE PROJECT" title={<>Transit data,<br /><em>made understandable.</em></>} description="BUSBEST is a B.Tech Big Data demonstration for crowdsourced bus tracking, traffic classification, and transparent ETA estimates." /><div className="about-grid"><article className="about-card about-card--dark"><span className="about-number">01</span><h2>Local Big Data processing</h2><p>Ubuntu WSL runs Hadoop/HDFS, MapReduce, Hive, and HBase. GPS history stays in HDFS; latest bus state is read from HBase; Hive and MapReduce provide historical analytics.</p><span className="stack-label">LOCAL DEVELOPMENT ENVIRONMENT</span></article><article className="about-card"><span className="about-number">02</span><h2>Application services</h2><p>The Express API connects the web app to HBase-backed bus state and to MongoDB application records such as users, bus registrations, routes, and issue reports.</p><span className="stack-label">LOCAL WEB APPLICATION</span></article><article className="about-card"><span className="about-number">03</span><h2>Honest ETA</h2><p>Traffic labels use named demo thresholds. ETA divides configured remaining distance by an available estimated speed. The distance inputs are explicitly hypothetical.</p><span className="stack-label">NO AI TRAFFIC PREDICTION</span></article><article className="about-card"><span className="about-number">04</span><h2>Consent comes first</h2><p>Browser location is requested only after a signed-in user chooses the contribution flow, confirms they are aboard, and accepts the consent notice.</p><span className="stack-label">NO BACKGROUND TRACKING</span></article></div><div className="source-note source-note--wide"><span>!</span><p><strong>SIMULATED DEMO DATA.</strong> The existing five bus locations and historical GPS records are simulated and are not real passenger or vehicle telemetry. This deployment is a local demonstration; Hadoop, HDFS, Hive, and HBase are not cloud production services.</p></div></section>;
}

export function PublicRoutePage() {
  const { routeId } = useParams();
  const live = useLiveBuses();
  const route = live.data?.routes.find((item) => item.route_id === routeId);
  const buses = (live.data?.buses || []).filter((bus) => bus.route_id === routeId);
  if (live.loading) return <section className="container page-pad"><Loading /></section>;
  if (live.error) return <section className="container page-pad"><ErrorPanel error={live.error} onRetry={live.reload} /></section>;
  if (!route) return <section className="container page-pad"><EmptyState title="Route not found" text="This route is not in the public route list." action={<Link to="/">Back to buses</Link>} /></section>;
  return <section className="container content-page"><Link className="back-link" to="/">← All buses</Link><PageHeading eyebrow="PUBLIC ROUTE" title={<>{route.name} <em>{route.route_id}</em></>} description={`${route.start || "Start not configured"} → ${route.destination || "Destination not configured"}`} /><div className="route-detail-grid"><div className="route-stop-strip"><p className="eyebrow">ORDERED STOPS</p>{route.stops?.length ? <ol>{route.stops.map((stop) => <li key={stop.stopId}><span>{stop.sequence}</span><div><b>{stop.name}</b><small>{stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}</small></div></li>)}</ol> : <p className="muted">This route has no configured stops yet.</p>}</div><div className="map-canvas route-map"><BusMap buses={buses} routes={[route]} /><div className="map-scale">OpenStreetMap © contributors</div></div></div><div className="section-title-row"><h2>Bus states</h2><span>{buses.length} buses</span></div>{buses.length ? <div className="recent-bus-grid">{buses.map((bus) => <BusCard key={bus.bus_id} bus={bus} />)}</div> : <EmptyState title="No buses on this route" text="No current or registered bus is assigned to this route." />}</section>;
}

export function AuthPage({ mode }) {
  const register = mode === "register";
  const { user, login, register: createAccount } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => { if (user) navigate(user.role === "ADMIN" ? "/admin" : "/dashboard", { replace: true }); }, [user, navigate]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const form = new FormData(event.currentTarget);
    try {
      let account;
      if (register) {
        if (form.get("password") !== form.get("confirmPassword")) throw new Error("Those passwords don't match.");
        account = await createAccount(form.get("name"), form.get("email"), form.get("password"));
        setSuccess("Your account is ready.");
      } else {
        account = await login(form.get("email"), form.get("password"));
      }
      navigate(account.role === "ADMIN" ? "/admin" : "/dashboard", { replace: true });
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }

  return <section className="auth-page container"><div className="auth-aside"><p className="eyebrow">{register ? "JOIN THE JOURNEY" : "WELCOME BACK"}</p><h1>{register ? <>A better way<br />to <em>get there.</em></> : <>Good to see<br /><em>you again.</em></>}</h1><p>{register ? "Create an account to manage your bus contributions and report issues." : "Sign in to continue to your BUSBEST workspace."}</p><div className="auth-aside-foot"><span className="demo-chip">SIMULATED DEMO PROJECT</span><span>Consent-led · transparent · local</span></div></div><div className="auth-card"><div><p className="eyebrow">{register ? "CREATE ACCOUNT" : "ACCOUNT ACCESS"}</p><h2>{register ? "Create your account" : "Sign in to BUSBEST"}</h2><p className="muted">{register ? "Your role starts as USER. Admin access is granted separately." : "Your session stays in this browser tab."}</p></div>{error && <div className="form-alert" role="alert">{error}</div>}{success && <div className="form-success" role="status">{success}</div>}<form onSubmit={submit} className="form-stack">{register && <label>Full name<input name="name" autoComplete="name" minLength="2" maxLength="80" required /></label>}<label>Email address<input type="email" name="email" autoComplete="email" maxLength="254" required /></label><label>Password<input type="password" name="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 12 : 1} maxLength="72" required />{register && <small>Use 12–72 characters.</small>}</label>{register && <label>Confirm password<input type="password" name="confirmPassword" autoComplete="new-password" minLength="12" maxLength="72" required /></label>}<button className="button button--orange button--full" disabled={busy}>{busy ? "Please wait…" : register ? "Create account" : "Sign in"}<span>↗</span></button></form><p className="auth-switch">{register ? "Already have an account?" : "New to BUSBEST?"} <Link to={register ? "/login" : "/register"}>{register ? "Sign in" : "Create an account"}</Link></p></div></section>;
}

export function BusDetailPage() {
  const { busId } = useParams();
  const { user } = useAuth();
  const live = useLiveBuses();
  const owned = useData("/my/buses", Boolean(user));
  const tracking = useTracking();
  const { t } = usePreferences();
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const publicBus = live.data?.buses.find((item) => item.bus_id === busId);
  const appBus = owned.data?.buses.find((item) => item.busId === busId);
  const route = live.data?.routes.find((item) => item.route_id === (publicBus?.route_id || appBus?.routeId));
  const current = publicBus || (appBus ? { bus_id: appBus.busId, route_id: appBus.routeId, name: appBus.name, tracking_status: appBus.trackingStatus || "NO_LIVE_DATA", data_label: "NO LIVE DATA", traffic_level: "UNKNOWN", status: appBus.status } : null);
  const hasLocation = current?.latitude != null && current?.longitude != null;
  const loading = live.loading || (Boolean(user) && owned.loading);
  const error = live.error || (Boolean(user) && owned.error);
  const alreadySharingThisBus = tracking.session?.bus_id === busId;

  async function startSharing(event) {
    event.preventDefault();
    if (!consent) { setNotice("Confirm the travel and location-sharing statement to continue."); return; }
    setBusy(true); setNotice("");
    try { await tracking.start(busId); setNotice("Tracking session started. Use Stop sharing in the header at any time."); }
    catch (reason) { setNotice(reason.message); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="container page-pad"><Loading /></div>;
  if (error && !current) return <section className="container page-pad"><ErrorPanel error={error} onRetry={live.reload} /></section>;
  if (!current) return <section className="container page-pad"><EmptyState title="Bus not found" text="This bus is not in the current feed or your managed bus list." action={<Link to="/" className="button button--outline">Back to map</Link>} /></section>;
  const isDemo = current.tracking_status === "DEMO" || current.data_label?.includes("SIMULATED");
  const eligible = user && (!appBus || appBus.status === "ACTIVE");
  return <section className="container content-page"><Link className="back-link" to={user ? "/my-buses" : "/"}>← Back</Link><PageHeading eyebrow={isDemo ? "SIMULATED DEMONSTRATION STATE" : current.tracking_status || "BUS STATE"} title={current.bus_id} description={route?.start && route?.destination ? `${route.start} → ${route.destination}` : `${route?.name || current.route_id}${current.name ? ` · ${current.name}` : ""}`} /><div className="detail-grid"><article className="detail-card"><div className="detail-card-head"><span>AGGREGATED BUS STATE</span><TrackingStatus bus={current} /></div>{hasLocation ? <><div className="detail-big-number">{current.speed ?? "—"}<small>km/h</small></div><div className="detail-facts"><div><span>{t("route")}</span><strong>{current.route_id}</strong></div><div><span>{t("traffic")}</span><strong>{current.traffic_level || "UNKNOWN"}</strong></div><div><span>{t("nextStop")}</span><strong>{current.next_stop?.name || "Not available"}</strong></div><div><span>{t("eta")}</span><strong>{current.eta_minutes == null ? (current.eta_status === "zero_speed" ? t("waiting") : t("etaUnavailable")) : `${current.eta_minutes} min`}</strong></div><div><span>{t("lastUpdate")}</span><strong>{current.timestamp ? new Date(current.timestamp).toLocaleString() : "Unavailable"}</strong></div><div><span>{t("gpsQuality")}</span><strong>{current.gps_accuracy_m == null ? "Not reported" : `±${Math.round(current.gps_accuracy_m)} m`}</strong></div></div><div className="source-note"><span>i</span><p><strong>{current.data_label}</strong><br />{current.eta_distance_note || (isDemo ? "Prepared sample state; not live GPS." : "Position is aggregated from recent consenting contributors. Individual locations are not public.")}</p></div></> : <><p className="detail-registry-note">Live location currently unavailable.</p><div className="detail-facts"><div><span>{t("route")}</span><strong>{current.route_id}</strong></div><div><span>Data source</span><strong>{current.data_label || "NO LIVE DATA"}</strong></div><div><span>{t("lastUpdate")}</span><strong>{current.timestamp ? new Date(current.timestamp).toLocaleString() : "No GPS update yet"}</strong></div></div></>}</article><div className="detail-map">{hasLocation ? <BusMap buses={[current]} routes={route ? [route] : []} compact /> : <div className="map-empty"><span>◎</span><p>Live location currently unavailable.</p></div>}</div></div>{route?.stops?.length > 0 && <section className="route-stop-strip"><p className="eyebrow">{route.name} · {t("stops").toUpperCase()}</p><ol>{[...route.stops].sort((a, b) => a.sequence - b.sequence).map((stop) => <li key={stop.stopId}><span>{stop.sequence}</span>{stop.name}</li>)}</ol></section>}
    {user && eligible && <section className="contribute-card"><div><p className="eyebrow">OPTIONAL CROWD CONTRIBUTION</p><h2>{alreadySharingThisBus ? t("sessionActive") : t("trackingTitle")}</h2><p>{t("sharingExplanation")} {current.bus_id}. {t("historyNotice")}</p></div>{alreadySharingThisBus ? <div className="tracking-session-panel"><span className="tracking-status tracking-status--live">{tracking.sharing ? t("active") : t("sessionActive")}</span><p>{tracking.sharing ? t("sharingNow") : t("resumeSharing")}</p>{tracking.error && <p className="form-alert" role="alert">{tracking.error}</p>}<div className="managed-actions"><button className="button button--orange" onClick={tracking.resume} disabled={tracking.sharing}>{tracking.sharing ? t("active") : t("resumeSharing")}</button><button className="button button--outline" onClick={tracking.stop}>{t("stop")}</button></div></div> : <form className="form-stack" onSubmit={startSharing}><label className="check-line"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>{t("travelConsent")}</span></label><button className="button button--orange" disabled={busy || !consent || Boolean(tracking.session)}>{busy ? `${t("startSharing")}…` : t("startSharing")}</button>{tracking.session && <p className="muted">You already have an active session for {tracking.session.bus_id}. Stop it before selecting another bus.</p>}{(notice || tracking.error) && <p className="inline-status" role="status">{notice || tracking.error}</p>}</form>}<p className="source-note source-note--wide"><span>!</span><span>{t("locationHelp")} {t("historyNotice")} Sharing requires an active, bus-specific session. Use {t("stop")} to stop.</span></p></section>}
  </section>;
}
