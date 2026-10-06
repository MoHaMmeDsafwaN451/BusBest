import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { http } from "../api";
import { useAuth } from "../context/AuthContext";
import { useData } from "../hooks";
import { useLiveBuses } from "../useLiveBuses";
import { BusCard } from "../components/BusCard";
import { EmptyState, ErrorPanel, Loading, PageHeading, StatCard } from "../components/Layout";

export function DashboardPage() {
  const mine = useData("/my/buses");
  const current = useLiveBuses();
  const buses = mine.data?.buses || [];
  const active = buses.filter((bus) => bus.status === "ACTIVE").length;
  const traffic = (current.data?.buses || []).reduce((counts, bus) => { counts[bus.traffic_level] = (counts[bus.traffic_level] || 0) + 1; return counts; }, {});
  if (mine.loading) return <div className="container page-pad"><Loading label="Loading your dashboard" /></div>;
  return <section className="container content-page"><PageHeading eyebrow="YOUR SPACE" title={<>A little more<br /><em>in control.</em></>} description="Your bus contributions and what’s happening across the network." action={<Link className="button button--orange" to="/buses/new">＋ Add a bus</Link>} />{mine.error && <ErrorPanel error={mine.error} onRetry={mine.reload} />}<div className="stats-grid"><StatCard label="MY BUSES" value={buses.length} detail="Owned or shared with you" /><StatCard label="ACTIVE" value={active} detail="Approved for tracking" accent /><StatCard label="NETWORK BUSES" value={current.data?.count ?? "—"} detail="Latest HBase states" /><StatCard label="HEAVY TRAFFIC" value={traffic.HEAVY ?? 0} detail="Current classifications" /></div><div className="content-columns"><section><div className="section-title-row"><div><p className="eyebrow">YOUR FLEET</p><h2>My buses</h2></div><Link to="/my-buses" className="arrow-link">Manage all ↗</Link></div>{buses.length ? buses.slice(0, 4).map((bus) => <BusCard key={bus.id} bus={bus} to={`/buses/${encodeURIComponent(bus.busId)}`} secondary="View bus details" />) : <EmptyState title="Your fleet starts here" text="Add a bus to register it for admin review. It will appear here immediately." action={<Link to="/buses/new" className="button button--dark">Add your first bus</Link>} />}</section><aside className="tip-card"><span className="tip-icon">✳</span><p className="eyebrow">A QUICK NOTE</p><h3>New buses need review.</h3><p>Only activated buses can receive tracking contributions. Location sharing is optional and tied to an active bus session.</p><Link to="/report-issue" className="arrow-link">Report an issue ↗</Link></aside></div><section className="recent-section"><div className="section-title-row"><div><p className="eyebrow">NETWORK ACTIVITY</p><h2>Recent bus updates</h2></div><Link to="/#live-map" className="arrow-link">Open live map ↗</Link></div>{current.error ? <ErrorPanel error={current.error} onRetry={current.reload} /> : current.loading ? <Loading /> : <div className="recent-bus-grid">{(current.data?.buses || []).slice(0, 5).map((bus) => <BusCard key={bus.bus_id} bus={bus} />)}</div>}</section></section>;
}

export function MyBusesPage() {
  const mine = useData("/my/buses");
  const location = useLocation();
  const [message, setMessage] = useState(location.state?.notice || "");
  async function remove(bus) {
    if (!window.confirm(`Remove ${bus.busId} from your application bus list? Its HDFS/HBase history is not deleted.`)) return;
    setMessage("");
    try { await http.delete(`/buses/${encodeURIComponent(bus.busId)}`); setMessage(`${bus.busId} removed from your application list.`); mine.reload(); }
    catch (error) { setMessage(error.message); }
  }
  return <section className="container content-page"><PageHeading eyebrow="YOUR CONTRIBUTIONS" title={<>My <em>buses.</em></>} description="Application bus registrations you own or have permission to manage." action={<Link to="/buses/new" className="button button--orange">＋ Add bus</Link>} />{message && <div className="form-success" role="status">{message}</div>}{mine.error && <ErrorPanel error={mine.error} onRetry={mine.reload} />}{mine.loading ? <Loading /> : mine.data?.buses.length ? <div className="managed-list">{mine.data.buses.map((bus) => <article className="managed-row" key={bus.id}><div><span className="eyebrow">{bus.routeId}</span><h3>{bus.busId}</h3><p>{bus.name || "Bus registration"} · {bus.status}</p></div><div className="managed-actions"><Link to={`/buses/${encodeURIComponent(bus.busId)}`} className="button button--outline button--small">Details</Link><Link to={`/buses/${encodeURIComponent(bus.busId)}/edit`} className="button button--quiet button--small">Edit</Link><button onClick={() => remove(bus)} className="button button--danger-quiet button--small">Remove</button></div></article>)}</div> : <EmptyState title="No buses registered" text="Add one to start managing bus information in BUSBEST." action={<Link className="button button--orange" to="/buses/new">Add a bus</Link>} />}</section>;
}

export function AddBusPage() {
  const navigate = useNavigate();
  const routes = useData("/routes");
  const registry = useData("/registry/routes");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    const values = new FormData(event.currentTarget);
    try {
      const result = await http.post("/buses", { busId: values.get("busId").trim().toUpperCase(), name: values.get("name").trim(), routeId: values.get("routeId") });
      setSuccess(`${result.bus.busId} was added and is pending admin review.`);
      navigate("/my-buses", { state: { notice: `${result.bus.busId} was added successfully.` } });
    } catch (reason) { setError(reason.code === "bus_id_already_registered" ? "That bus ID is already registered. Try another ID." : reason.message); }
    finally { setBusy(false); }
  }
  const routeOptions = [...(routes.data?.routes || []).map((route) => ({ id: route.route_id, label: `${route.route_id} · ${route.bus_count} current buses` })), ...(registry.data?.routes || []).map((route) => ({ id: route.routeId, label: `${route.routeId} · ${route.name}` }))].filter((route, index, all) => all.findIndex((item) => item.id === route.id) === index);
  return <section className="container content-page narrow-page"><Link className="back-link" to="/my-buses">← My buses</Link><PageHeading eyebrow="ADD TO BUSBEST" title={<>Bring a bus<br /><em>on board.</em></>} description="Add an application record. It becomes available for telemetry after an admin reviews it." /><div className="form-card">{error && <div className="form-alert" role="alert">{error}</div>}{success && <div className="form-success" role="status">{success}</div>}<form onSubmit={submit} className="form-stack"><label>Bus ID<input name="busId" placeholder="e.g. B106" minLength="2" maxLength="40" pattern="[A-Za-z0-9._-]+" required autoCapitalize="characters" /><small>Unique ID used to look up this bus.</small></label><label>Bus name or label<input name="name" placeholder="e.g. Town service 6" maxLength="100" /></label><label>Route<select name="routeId" required disabled={routes.loading || registry.loading || Boolean(routes.error || registry.error)}><option value="">Choose a route</option>{routeOptions.map((route) => <option key={route.id} value={route.id}>{route.label}</option>)}</select>{(routes.error || registry.error) && <small>{(routes.error || registry.error).message} Route choices require the route services.</small>}</label><div className="status-preview"><span>Initial status</span><b>PENDING REVIEW</b><small>Only an admin can activate a bus. This field is assigned by the backend.</small></div><button className="button button--orange button--full" disabled={busy || routes.loading || registry.loading || !routeOptions.length}>{busy ? "Adding bus…" : "Add bus for review"}<span>↗</span></button></form><p className="form-footnote">Bus registrations are stored in MongoDB application data. This form does not modify the GPS dataset or Big Data files.</p></div></section>;
}

export function EditBusPage() {
  const { busId } = useParams();
  const navigate = useNavigate();
  const [bus, setBus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { http.get("/my/buses").then((result) => { const found = result.buses.find((item) => item.busId === busId); if (!found) setError("This bus is not in your managed list."); else setBus(found); }).catch((reason) => setError(reason.message)); }, [busId]);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError("");
    const values = new FormData(event.currentTarget);
    try { await http.put(`/buses/${encodeURIComponent(busId)}`, { name: values.get("name").trim(), routeId: values.get("routeId").trim() }); navigate("/my-buses"); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  return <section className="container content-page narrow-page"><Link className="back-link" to="/my-buses">← My buses</Link><PageHeading eyebrow="BUS DETAILS" title={<>Edit <em>{busId}</em></>} description="Only your bus label and route can be changed. Status is admin-controlled." />{error && <div className="form-alert" role="alert">{error}</div>}{bus && <div className="form-card"><form className="form-stack" onSubmit={save}><label>Bus ID<input value={bus.busId} disabled /></label><label>Bus name or label<input name="name" defaultValue={bus.name} maxLength="100" /></label><label>Route ID<input name="routeId" defaultValue={bus.routeId} minLength="1" maxLength="40" required /></label><div className="status-preview"><span>Current status</span><b>{bus.status}</b></div><button className="button button--orange button--full" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></form></div>}</section>;
}

export function ProfilePage() {
  const { user } = useAuth();
  return <section className="container content-page narrow-page"><PageHeading eyebrow="ACCOUNT" title={<>Your <em>profile.</em></>} description="Your BUSBEST account details and access level." /><div className="profile-card"><div className="avatar avatar--large">{user?.name?.slice(0, 1).toUpperCase()}</div><dl className="profile-details"><div><dt>Name</dt><dd>{user?.name}</dd></div><div><dt>Email</dt><dd>{user?.email}</dd></div><div><dt>Role</dt><dd>{user?.role}</dd></div><div><dt>Joined</dt><dd>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</dd></div></dl><p className="form-footnote">Password changes are not available in this demonstration yet. Your password is stored as a bcrypt hash and never shown here.</p></div></section>;
}

export function ReportIssuePage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    const values = new FormData(event.currentTarget);
    try { await http.post("/reports", { reportType: values.get("reportType"), busId: values.get("busId").trim(), routeId: values.get("routeId").trim(), description: values.get("description").trim() }); navigate("/my-reports", { state: { notice: "Your issue report was submitted." } }); }
    catch (reason) { setMessage(reason.message); }
    finally { setBusy(false); }
  }
  return <section className="container content-page narrow-page"><PageHeading eyebrow="HELP IMPROVE BUSBEST" title={<>Report an<br /><em>issue.</em></>} description="Share a data concern or a bus/route issue. An admin can review your report." />{message && <div className="form-alert" role="alert">{message}</div>}<div className="form-card"><form className="form-stack" onSubmit={submit}><label>Issue category<select name="reportType"><option value="BUS_ISSUE">Bus issue</option><option value="ROUTE_ISSUE">Route issue</option><option value="DATA_ISSUE">Data quality</option><option value="SAFETY">Safety concern</option></select></label><div className="form-row"><label>Bus ID (optional)<input name="busId" maxLength="40" placeholder="B101" /></label><label>Route ID (optional)<input name="routeId" maxLength="40" placeholder="R01" /></label></div><label>What happened?<textarea name="description" minLength="10" maxLength="1200" rows="5" placeholder="Include enough detail for the review team to understand the issue…" required /></label><button className="button button--orange button--full" disabled={busy}>{busy ? "Submitting…" : "Submit report"}<span>↗</span></button></form></div></section>;
}

export function MyReportsPage() {
  const reports = useData("/reports/mine");
  return <section className="container content-page"><PageHeading eyebrow="YOUR REPORTS" title={<>Issue <em>history.</em></>} description="See the reports you have shared with the BUSBEST admin team." action={<Link to="/report-issue" className="button button--orange">＋ New report</Link>} />{reports.error && <ErrorPanel error={reports.error} onRetry={reports.reload} />}{reports.loading ? <Loading /> : reports.data?.reports.length ? <div className="report-list">{reports.data.reports.map((report) => <article key={report.id} className="report-row"><div><span className="eyebrow">{report.reportType.replaceAll("_", " ")}</span><h3>{report.busId || report.routeId || "Network report"}</h3><p>{report.description}</p></div><span className={`status-tag status-tag--${report.status.toLowerCase()}`}>{report.status}</span></article>)}</div> : <EmptyState title="No reports yet" text="Use the issue form to flag something for review." action={<Link className="button button--outline" to="/report-issue">Report an issue</Link>} />}</section>;
}
