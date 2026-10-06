import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, Link } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { SiteLayout, Loading } from "./components/Layout";
import { RequireAdmin, RequireUser, SignedIn } from "./components/Access";
import { AboutPage, AuthPage, BusDetailPage, HomePage, PublicRoutePage } from "./pages/PublicPages";
const AddBusPage = lazy(() => import("./pages/UserPages").then((module) => ({ default: module.AddBusPage })));
const DashboardPage = lazy(() => import("./pages/UserPages").then((module) => ({ default: module.DashboardPage })));
const EditBusPage = lazy(() => import("./pages/UserPages").then((module) => ({ default: module.EditBusPage })));
const MyBusesPage = lazy(() => import("./pages/UserPages").then((module) => ({ default: module.MyBusesPage })));
const MyReportsPage = lazy(() => import("./pages/UserPages").then((module) => ({ default: module.MyReportsPage })));
const ProfilePage = lazy(() => import("./pages/UserPages").then((module) => ({ default: module.ProfilePage })));
const ReportIssuePage = lazy(() => import("./pages/UserPages").then((module) => ({ default: module.ReportIssuePage })));
const AdminAnalyticsPage = lazy(() => import("./pages/AdminPages").then((module) => ({ default: module.AdminAnalyticsPage })));
const AdminBusesPage = lazy(() => import("./pages/AdminPages").then((module) => ({ default: module.AdminBusesPage })));
const AdminDashboardPage = lazy(() => import("./pages/AdminPages").then((module) => ({ default: module.AdminDashboardPage })));
const AdminReportsPage = lazy(() => import("./pages/AdminPages").then((module) => ({ default: module.AdminReportsPage })));
const AdminRoutesPage = lazy(() => import("./pages/AdminPages").then((module) => ({ default: module.AdminRoutesPage })));
const AdminSystemPage = lazy(() => import("./pages/AdminPages").then((module) => ({ default: module.AdminSystemPage })));
const AdminTrackingPage = lazy(() => import("./pages/AdminPages").then((module) => ({ default: module.AdminTrackingPage })));
const AdminUsersPage = lazy(() => import("./pages/AdminPages").then((module) => ({ default: module.AdminUsersPage })));

function ForbiddenPage() {
  const { user } = useAuth();
  return <section className="container page-pad"><div className="forbidden-card"><p className="eyebrow">ACCESS RESTRICTED</p><h1>This area is for <em>admins.</em></h1><p>Your account is signed in as {user?.role}. Admin tools are not available to this role.</p><Link className="button button--orange" to="/dashboard">Back to my dashboard</Link></div></section>;
}

function NotFound() { return <section className="container page-pad"><div className="forbidden-card"><p className="eyebrow">NOT FOUND</p><h1>That route isn't <em>here.</em></h1><Link className="button button--orange" to="/">Return to the live map</Link></div></section>; }

function RoleLanding() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return <Navigate to={user?.role === "ADMIN" ? "/admin" : "/dashboard"} replace />;
}

export default function App() {
  return <Suspense fallback={<Loading label="Loading BUSBEST page" />}><Routes><Route element={<SiteLayout />}>
    <Route index element={<HomePage />} />
    <Route path="about" element={<AboutPage />} />
    <Route path="routes/:routeId" element={<PublicRoutePage />} />
    <Route path="buses/:busId" element={<BusDetailPage />} />
    <Route path="login" element={<AuthPage mode="login" />} />
    <Route path="register" element={<AuthPage mode="register" />} />
    <Route path="forbidden" element={<ForbiddenPage />} />
    <Route element={<SignedIn />}><Route element={<RequireUser />}>
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="my-buses" element={<MyBusesPage />} />
      <Route path="buses/new" element={<AddBusPage />} />
      <Route path="buses/:busId/edit" element={<EditBusPage />} />
      <Route path="profile" element={<ProfilePage />} />
      <Route path="report-issue" element={<ReportIssuePage />} />
      <Route path="my-reports" element={<MyReportsPage />} />
    </Route></Route>
    <Route element={<SignedIn />}><Route element={<RequireAdmin />}>
      <Route path="admin" element={<AdminDashboardPage />} />
      <Route path="admin/users" element={<AdminUsersPage />} />
      <Route path="admin/buses" element={<AdminBusesPage />} />
      <Route path="admin/routes" element={<AdminRoutesPage />} />
      <Route path="admin/reports" element={<AdminReportsPage />} />
      <Route path="admin/tracking" element={<AdminTrackingPage />} />
      <Route path="admin/analytics" element={<AdminAnalyticsPage />} />
      <Route path="admin/system" element={<AdminSystemPage />} />
    </Route></Route>
    <Route path="workspace" element={<SignedIn />}><Route index element={<RoleLanding />} /></Route>
    <Route path="*" element={<NotFound />} />
  </Route></Routes></Suspense>;
}
