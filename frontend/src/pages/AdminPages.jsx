import { useState } from "react";
import { Link, NavLink, useSearchParams } from "react-router-dom";
import { http } from "../api";
import { useData } from "../hooks";
import { TrafficPill } from "../components/BusCard";
import { EmptyState, ErrorPanel, Loading, PageHeading, StatCard } from "../components/Layout";

function AdminNavigation() {
  return <nav className="admin-nav" aria-label="Admin sections"><span className="eyebrow">ADMIN WORKSPACE</span><NavLink to="/admin" end>Overview</NavLink><NavLink to="/admin/users">Users</NavLink><NavLink to="/admin/buses">Buses</NavLink><NavLink to="/admin/routes">Routes</NavLink><NavLink to="/admin/tracking">Live tracking</NavLink><NavLink to="/admin/reports">Issue reports</NavLink><NavLink to="/admin/analytics">Analytics</NavLink><NavLink to="/admin/system">System status</NavLink></nav>;
}

function AdminFrame({ children }) { return <section className="container content-page"><div className="admin-layout"><AdminNavigation /><div className="admin-content">{children}</div></div></section>; }

function RouteStopsEditor({ initialStops = [] }) {
  const [stops, setStops] = useState(() => initialStops.map((stop) => ({ ...stop })));
  function change(index, field, value) { setStops((current) => current.map((stop, position) => position === index ? { ...stop, [field]: value } : stop)); }
  function move(index, direction) { setStops((current) => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; }); }
  function addStop() { const id = `STP-${Date.now().toString(36).toUpperCase()}`; setStops((current) => [...current, { stopId: id, name: "", latitude: "", longitude: "" }]); }
  const encoded = JSON.stringify(stops.map((stop, index) => ({ ...stop, latitude: stop.latitude === "" ? null : Number(stop.latitude), longitude: stop.longitude === "" ? null : Number(stop.longitude), sequence: index + 1 })));
  return <fieldset className="route-stop-editor"><legend>Ordered route stops</legend>{stops.map((stop, index) => <div className="route-stop-edit-row" key={`${stop.stopId}-${index}`}><label>Stop ID<input value={stop.stopId} maxLength="40" onChange={(event) => change(index, "stopId", event.target.value)} required /></label><label>Stop name<input value={stop.name} maxLength="100" onChange={(event) => change(index, "name", event.target.value)} required /></label><label>Latitude<input type="number" min="-90" max="90" step="any" value={stop.latitude} onChange={(event) => change(index, "latitude", event.target.value)} required /></label><label>Longitude<input type="number" min="-180" max="180" step="any" value={stop.longitude} onChange={(event) => change(index, "longitude", event.target.value)} required /></label><div className="route-stop-actions"><button type="button" className="button button--quiet button--small" aria-label={`Move ${stop.name || stop.stopId} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" className="button button--quiet button--small" aria-label={`Move ${stop.name || stop.stopId} down`} disabled={index === stops.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className="button button--danger-quiet button--small" onClick={() => setStops((current) => current.filter((_, position) => position !== index))}>Remove</button></div></div>)}<input type="hidden" name="stops" value={encoded} readOnly /><button type="button" className="button button--outline button--small" onClick={addStop}>Add stop</button></fieldset>;
}

export function AdminDashboardPage() {
  const users = useData("/admin/users");
  const buses = useData("/admin/buses");
  const routes = useData("/admin/routes");
  const reports = useData("/admin/reports");
  const analytics = useData("/analytics/summary");
  const system = useData("/admin/system");
  const tracking = useData("/admin/tracking");
  const resources = [users, buses, routes, reports, analytics, system, tracking];
  const firstError = resources.find((item) => item.error)?.error;
  const busRows = buses.data?.buses || [];
  const trackingRows = tracking.data?.buses || [];
  const openReports = (reports.data?.reports || []).filter((report) => report.status === "OPEN").length;
  const live = trackingRows.filter((item) => ["LIVE", "LIMITED_DATA"].includes(item.tracking_status)).length;
  const stale = trackingRows.filter((item) => item.tracking_status === "STALE").length;
  const noLive = trackingRows.filter((item) => item.tracking_status === "NO_LIVE_DATA").length;
  return <AdminFrame><PageHeading eyebrow="CONTROL ROOM" title={<>Network <em>overview.</em></>} description="Application records, current contributor status, and local service health." />{firstError && <ErrorPanel error={firstError} onRetry={() => resources.forEach((item) => item.reload())} />}<div className="stats-grid stats-grid--four"><StatCard label="REGISTERED USERS" value={users.data?.count ?? "—"} detail="MongoDB accounts" /><StatCard label="APP BUSES" value={busRows.length} detail={`${busRows.filter((bus) => bus.status === "ACTIVE").length} active`} accent /><StatCard label="ACTIVE ROUTES" value={(routes.data?.routes || []).filter((route) => route.status === "ACTIVE").length} detail="Ordered stop lists" /><StatCard label="OPEN REPORTS" value={openReports} detail="Waiting for review" /><StatCard label="LIVE / LIMITED" value={live} detail="Recent contributors" accent /><StatCard label="STALE" value={stale} detail="Telemetry stopped" /><StatCard label="NO LIVE DATA" value={noLive} detail="No recent signals" /><StatCard label="ACTIVE SESSIONS" value={tracking.data?.active_sessions ?? "—"} detail="Private session IDs hidden" /></div><div className="status-banner"><span className={`health-dot${system.data?.big_data_pipeline === "available" ? " health-dot--good" : ""}`} /><div><strong>Local services</strong><p>MongoDB: {system.data?.mongodb || "checking"} · Big Data pipeline: {system.data?.big_data_pipeline || "checking"}{system.data?.data_label ? ` · ${system.data.data_label}` : ""}</p></div><Link to="/admin/system" className="arrow-link">Details ↗</Link></div><div className="admin-dashboard-columns"><section className="admin-panel"><div className="section-title-row"><h2>Bus review queue</h2><Link to="/admin/buses" className="arrow-link">All buses ↗</Link></div>{buses.loading ? <Loading /> : busRows.filter((bus) => bus.status === "PENDING_REVIEW").length ? busRows.filter((bus) => bus.status === "PENDING_REVIEW").slice(0, 5).map((bus) => <div className="compact-row" key={bus.id}><div><strong>{bus.busId}</strong><span>{bus.name || bus.routeId}</span></div><span className="status-tag status-tag--pending_review">REVIEW</span></div>) : <p className="muted">No buses are waiting for review.</p>}</section><section className="admin-panel"><div className="section-title-row"><h2>Recent network state</h2><Link to="/admin/analytics" className="arrow-link">Analytics ↗</Link></div>{analytics.data?.current_traffic_distribution && Object.entries(analytics.data.current_traffic_distribution).map(([name, count]) => <div className="traffic-row" key={name}><TrafficPill level={name} /><strong>{count}</strong><span>current buses</span></div>)}<p className="source-foot">{analytics.data?.data_label || "Waiting for pipeline"}</p><Link to="/admin/tracking" className="arrow-link">Open tracking quality ↗</Link></section></div></AdminFrame>;
}
export function AdminUsersPage() {
  const resource = useData("/admin/users");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function setRole(user, role) {
    setNotice(""); setError("");
    try { await http.put(`/admin/users/${user.id}/role`, { role }); setNotice(`${user.email} role updated to ${role}.`); resource.reload(); }
    catch (reason) { setError(reason.message); }
  }
  async function remove(user) {
    if (!window.confirm(`Delete ${user.email} and their application bus records? Historical HDFS/HBase data will remain.`)) return;
    try { await http.delete(`/admin/users/${user.id}`); setNotice(`${user.email} was removed.`); resource.reload(); }
    catch (reason) { setError(reason.message); }
  }
  return <AdminFrame><PageHeading eyebrow="ACCESS CONTROL" title={<>Manage <em>users.</em></>} description="Review registered accounts and assign application roles." />{notice && <div className="form-success" role="status">{notice}</div>}{error && <div className="form-alert" role="alert">{error}</div>}{resource.error && <ErrorPanel error={resource.error} onRetry={resource.reload} />}{resource.loading ? <Loading /> : <div className="table-wrap"><table><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead><tbody>{resource.data?.users.map((user) => <tr key={user.id}><td><b>{user.name}</b></td><td>{user.email}</td><td><select aria-label={`Role for ${user.email}`} value={user.role} onChange={(event) => setRole(user, event.target.value)}><option value="USER">USER</option><option value="ADMIN">ADMIN</option></select></td><td>{new Date(user.createdAt).toLocaleDateString()}</td><td><button className="button button--danger-quiet button--small" onClick={() => remove(user)}>Delete</button></td></tr>)}</tbody></table>{!resource.data?.users.length && <EmptyState title="No accounts" text="User registrations will appear here." />}</div>}</AdminFrame>;
}

export function AdminBusesPage() {
  const resource = useData("/admin/buses");
  const users = useData("/admin/users");
  const routes = useData("/admin/routes");
  const [searchParams] = useSearchParams();
  const [managers, setManagers] = useState({});
  const [routeIds, setRouteIds] = useState({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function update(bus, patch) {
    setError("");
    try { await http.put(`/buses/${encodeURIComponent(bus.busId)}`, patch); setNotice(`${bus.busId} updated.`); resource.reload(); }
    catch (reason) { setError(reason.message); }
  }
  async function remove(bus) {
    if (!window.confirm(`Remove ${bus.busId} from MongoDB app records? HDFS/HBase history stays.`)) return;
    try { await http.delete(`/buses/${encodeURIComponent(bus.busId)}`); setNotice(`${bus.busId} removed.`); resource.reload(); }
    catch (reason) { setError(reason.message); }
  }
  const listed = (resource.data?.buses || []).filter((bus) => !searchParams.get("route_id") || bus.routeId === searchParams.get("route_id"));
  const busy = resource.loading || users.loading || routes.loading;
  const loadError = resource.error || users.error || routes.error;
  return <AdminFrame><PageHeading eyebrow="APPLICATION REGISTRY" title={<>Review <em>buses.</em></>} description="Manage route assignments, permitted users, registration status, and telemetry approval." />{notice && <div className="form-success" role="status">{notice}</div>}{error && <div className="form-alert" role="alert">{error}</div>}{busy ? <Loading /> : loadError ? <ErrorPanel error={loadError} onRetry={() => { resource.reload(); users.reload(); routes.reload(); }} /> : listed.length ? <div className="managed-list">{listed.map((bus) => {
    const selected = managers[bus.id] ?? bus.permittedManagerIds;
    const eligible = (users.data?.users || []).filter((person) => person.id !== bus.ownerId);
    const route = routeIds[bus.id] ?? bus.routeId;
    return <article className="managed-row admin-managed-bus" key={bus.id}><div><span className="eyebrow">{bus.routeId} · {bus.status}</span><h3>{bus.busId}</h3><p>{bus.name || "Unnamed bus"}{bus.registrationNumber ? ` · ${bus.registrationNumber}` : ""}</p><label className="manager-picker">Application route<select value={route} onChange={(event) => setRouteIds((state) => ({ ...state, [bus.id]: event.target.value }))}>{(routes.data?.routes || []).filter((item) => item.status === "ACTIVE").map((item) => <option key={item.id} value={item.routeId}>{item.routeId} · {item.name}</option>)}</select></label>{route !== bus.routeId && <button className="button button--outline button--small" onClick={() => update(bus, { routeId: route })}>Reassign route</button>}<label className="manager-picker">Permitted users<select multiple value={selected} onChange={(event) => setManagers((state) => ({ ...state, [bus.id]: [...event.target.selectedOptions].map((option) => option.value) }))}>{eligible.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}</select></label><button className="button button--outline button--small" onClick={() => update(bus, { permittedUserIds: selected })}>Save permitted users</button></div><div className="managed-actions"><select aria-label={`Status for ${bus.busId}`} value={bus.status} onChange={(event) => update(bus, { status: event.target.value })}><option>PENDING_REVIEW</option><option>ACTIVE</option><option>SUSPENDED</option><option>REJECTED</option></select><button className="button button--danger-quiet button--small" onClick={() => remove(bus)}>Remove</button></div></article>;
  })}</div> : <EmptyState title="No app buses" text="No application bus records match this route." />}</AdminFrame>;
}
export function AdminRoutesPage() {
  const resource = useData("/admin/routes");
  const [editing, setEditing] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  function parseStops(raw) {
    let stops;
    try { stops = JSON.parse(raw || "[]"); } catch { throw new Error("Stops must be valid JSON."); }
    if (!Array.isArray(stops)) throw new Error("Stops must be a JSON array.");
    if (stops.some((stop) => typeof stop.stopId !== "string" || !stop.stopId.trim() || typeof stop.name !== "string" || !stop.name.trim() || !Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude))) throw new Error("Enter a stop ID, name, latitude, and longitude for every stop.");
    return stops.map((stop, index) => ({ ...stop, sequence: index + 1 }));
  }
  async function create(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setError(""); setNotice("");
    try { await http.post("/admin/routes", { routeId: form.get("routeId").trim().toUpperCase(), name: form.get("name").trim(), start: form.get("start").trim(), destination: form.get("destination").trim(), stops: parseStops(form.get("stops")) }); event.currentTarget.reset(); setNotice("Route created."); resource.reload(); }
    catch (reason) { setError(reason.message); }
  }
  async function update(event, route) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setError("");
    try { await http.put(`/admin/routes/${encodeURIComponent(route.routeId)}`, { name: form.get("name").trim(), start: form.get("start").trim(), destination: form.get("destination").trim(), stops: parseStops(form.get("stops")) }); setEditing(""); setNotice(`${route.routeId} updated.`); resource.reload(); }
    catch (reason) { setError(reason.message); }
  }
  async function setRouteStatus(route, status) {
    try { await http.put(`/admin/routes/${encodeURIComponent(route.routeId)}`, { status }); setNotice(`${route.routeId} ${status.toLowerCase()}.`); resource.reload(); }
    catch (reason) { setError(reason.message); }
  }
  async function remove(route) {
    if (route.busCount) { setError("This route cannot be deleted because one or more buses are assigned to it. Archive it or reassign those buses first."); return; }
    if (!window.confirm(`Delete unused application route ${route.routeId}?`)) return;
    try { await http.delete(`/admin/routes/${encodeURIComponent(route.routeId)}`); setNotice(`${route.routeId} deleted.`); resource.reload(); }
    catch (reason) { setError(reason.message); }
  }
  return <AdminFrame><PageHeading eyebrow="APPLICATION REGISTRY" title={<>Manage <em>routes.</em></>} description="Create routes and manage ordered stops, coordinates, and sequence. Reorder stops with the arrow controls." />{notice && <div className="form-success" role="status">{notice}</div>}{error && <div className="form-alert" role="alert">{error}</div>}
    <form className="inline-create-form" onSubmit={create}><h2>Add a route</h2><div className="form-row"><label>Route ID<input name="routeId" maxLength="40" required /></label><label>Name<input name="name" minLength="2" maxLength="100" required /></label></div><div className="form-row"><label>Start<input name="start" minLength="2" maxLength="120" required /></label><label>Destination<input name="destination" minLength="2" maxLength="120" required /></label></div><RouteStopsEditor /><button className="button button--orange">Add route</button></form>
    {resource.loading ? <Loading /> : resource.error ? <ErrorPanel error={resource.error} onRetry={resource.reload} /> : resource.data?.routes.map((route) => <article className="route-row admin-route-row" key={route.id}>{editing === route.routeId ? <form className="form-stack" onSubmit={(event) => update(event, route)}><label>Name<input name="name" defaultValue={route.name} required /></label><div className="form-row"><label>Start<input name="start" defaultValue={route.start} required /></label><label>Destination<input name="destination" defaultValue={route.destination} required /></label></div><RouteStopsEditor initialStops={route.stops || []} /><div className="managed-actions"><button className="button button--orange button--small">Save route and stops</button><button type="button" className="button button--quiet button--small" onClick={() => setEditing("")}>Cancel</button></div></form> : <><div><span className="eyebrow">{route.routeId} · {route.status} · {route.busCount || 0} assigned buses</span><h3>{route.name}</h3><p>{route.start} → {route.destination} · {route.stops?.length || 0} ordered stops</p><Link className="text-link" to={`/admin/buses?route_id=${encodeURIComponent(route.routeId)}`}>View assigned buses</Link></div><div className="managed-actions"><button className="button button--outline button--small" onClick={() => setEditing(route.routeId)}>Edit stops</button><button className="button button--quiet button--small" onClick={() => setRouteStatus(route, route.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED")}>{route.status === "ARCHIVED" ? "Reactivate" : "Archive route"}</button>{!route.busCount && <button className="button button--danger-quiet button--small" onClick={() => remove(route)}>Delete unused</button>}</div></>}</article>)}</AdminFrame>;
}
export function AdminReportsPage() {
  const resource = useData("/admin/reports");
  const [notice, setNotice] = useState("");
  async function change(report, status) {
    try { await http.put(`/admin/reports/${report.id}`, { status }); setNotice(`Report updated to ${status}.`); resource.reload(); }
    catch (error) { setNotice(error.message); }
  }
  return <AdminFrame><PageHeading eyebrow="COMMUNITY FEEDBACK" title={<>Issue <em>reports.</em></>} description="Review bus, route, safety, and data-quality reports submitted by authenticated users." />{notice && <div className="form-success" role="status">{notice}</div>}{resource.error && <ErrorPanel error={resource.error} onRetry={resource.reload} />}{resource.loading ? <Loading /> : resource.data?.reports.length ? <div className="report-list">{resource.data.reports.map((report) => <article className="report-row" key={report.id}><div><span className="eyebrow">{report.reportType.replaceAll("_", " ")} · {new Date(report.createdAt).toLocaleString()}</span><h3>{report.busId || report.routeId || "Network report"}</h3><p>{report.description}</p><small>Reporter reference · {report.reporterId.slice(-8)}</small></div><div className="report-review"><span className={`status-tag status-tag--${report.status.toLowerCase()}`}>{report.status}</span><select aria-label={`Status for report ${report.id}`} value={report.status} onChange={(event) => change(report, event.target.value)}><option>OPEN</option><option>REVIEWED</option><option>RESOLVED</option><option>REJECTED</option></select></div></article>)}</div> : <EmptyState title="No reports to review" text="User submitted reports will show up here." />}</AdminFrame>;
}

export function AdminTrackingPage() {
  const resource = useData("/admin/tracking");
  const rows = resource.data?.buses || [];
  return <AdminFrame><PageHeading eyebrow="AGGREGATED TELEMETRY" title={<>Live <em>tracking.</em></>} description="Operational status, freshness, contributor counts, and GPS quality only. Individual user identities and precise contributor coordinates are not shown." />{resource.error && <ErrorPanel error={resource.error} onRetry={resource.reload} />}{resource.loading ? <Loading /> : <><div className="stats-grid"><StatCard label="TRACKED BUSES" value={rows.length} detail="HBase and app registry" /><StatCard label="ACTIVE SESSIONS" value={resource.data?.active_sessions ?? 0} detail="User identities hidden" accent /><StatCard label="RECENT CONTRIBUTORS" value={rows.reduce((sum, row) => sum + row.contributor_count, 0)} detail="Recent quality-accepted sessions" /></div>{rows.length ? <div className="table-wrap"><table><thead><tr><th>Bus</th><th>Route</th><th>Tracking</th><th>Contributors</th><th>Last update</th><th>Accuracy</th><th>Speed</th><th>Source / confidence</th></tr></thead><tbody>{rows.map((row) => <tr key={row.bus_id}><td><b>{row.bus_id}</b></td><td>{row.route_id}</td><td><span className={`tracking-status tracking-status--${row.tracking_status.toLowerCase().replaceAll(" ", "_")}`}>{row.tracking_status}</span></td><td>{row.contributor_count}</td><td>{row.last_update ? new Date(row.last_update).toLocaleString() : "—"}</td><td>{row.accuracy_m == null ? "—" : `±${Math.round(row.accuracy_m)} m`}</td><td>{row.speed_kmh == null ? "—" : `${row.speed_kmh} km/h`}</td><td>{row.data_source}{row.confidence ? ` · ${row.confidence}` : ""}</td></tr>)}</tbody></table></div> : <EmptyState title="No bus states" text="No current HBase or application bus states are available." />}</>}</AdminFrame>;
}

export function AdminAnalyticsPage() {
  const resource = useData("/analytics/summary");
  if (resource.loading) return <AdminFrame><Loading label="Loading verified analytics" /></AdminFrame>;
  const report = resource.data;
  return <AdminFrame><PageHeading eyebrow="VERIFIED PIPELINE OUTPUT" title={<>Network <em>analytics.</em></>} description="Current state from the Python engine/HBase and historical speeds from the existing MapReduce output." />{resource.error && <ErrorPanel error={resource.error} onRetry={resource.reload} />}{report && <><p className="demo-chip">{report.data_label} · SOURCE {report.historical_average_source}</p><div className="stats-grid"><StatCard label="CURRENT BUSES" value={report.current_bus_count} detail="HBase-backed states" /><StatCard label="ROUTES" value={report.current_route_count} detail="From current pipeline records" /><StatCard label="HEAVY TRAFFIC" value={report.current_traffic_distribution.HEAVY || 0} detail="Current classification" accent /></div><div className="analytics-grid"><section className="admin-panel"><h2>Historical average speed by bus</h2>{report.historical_average_speed_by_bus.map((item) => <div className="bar-row" key={item.bus_id}><span>{item.bus_id}</span><div className="bar-track"><i style={{ width: `${Math.max(2, item.average_speed_kmh / 60 * 100)}%` }} /></div><b>{item.average_speed_kmh} km/h</b></div>)}<p className="source-foot">Values are from the existing verified MapReduce output and previously matched Hive.</p></section><section className="admin-panel"><h2>Current traffic</h2>{Object.entries(report.current_traffic_distribution).map(([level, count]) => <div className="traffic-row" key={level}><TrafficPill level={level} /><strong>{count}</strong><span>of {report.current_bus_count} buses</span></div>)}<h3 className="subsection-title">Verified edge case</h3>{report.historical_edge_cases.map((item) => <p className="muted" key={item.source_timestamp}>{item.description} · {item.source_speed_kmh} km/h · {item.eta_status}</p>)}</section></div></>}</AdminFrame>;
}

export function AdminSystemPage() {
  const resource = useData("/admin/system");
  const services = resource.data ? { "Express API": resource.data.api, MongoDB: resource.data.mongodb, HDFS: resource.data.hdfs, HBase: resource.data.hbase, "MapReduce output": resource.data.mapreduce_output, Hive: resource.data.hive, Telemetry: resource.data.telemetry, WebSocket: resource.data.websocket } : {};
  return <AdminFrame><PageHeading eyebrow="LOCAL SERVICES" title={<>System <em>status.</em></>} description="Health checks describe this development environment, not a cloud production deployment." />{resource.error && <ErrorPanel error={resource.error} onRetry={resource.reload} />}{resource.loading ? <Loading /> : resource.data && <><div className="system-grid">{Object.entries(services).map(([name, status]) => <article className="system-card" key={name}><span className={`health-dot${status === "available" || status === "connected" || status === "available_local_hdfs_hbase" ? " health-dot--good" : ""}`} /><div><strong>{name}</strong><p>{status}</p></div></article>)}</div><div className="source-note source-note--wide"><span>i</span><p>HDFS, MapReduce, Hive, and HBase run locally under Ubuntu WSL for this project. They have not been deployed as cloud production services. Hive is labeled as unprobed unless verified separately. GPS source label: {resource.data.data_label || "pipeline unavailable"}.</p></div></>}</AdminFrame>;
}
