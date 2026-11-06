import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Pending from './pages/Pending.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Search from './pages/Search.jsx';
import RecordView from './pages/RecordView.jsx';
import Upload from './pages/Upload.jsx';
import Folders, { FolderView } from './pages/Folders.jsx';
import Users from './pages/admin/Users.jsx';
import AuditLog from './pages/admin/AuditLog.jsx';
import Settings from './pages/admin/Settings.jsx';
import DocumentTypes from './pages/admin/DocumentTypes.jsx';

function Only({ when, children }) {
  return when ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { user, profile, loading, error, canUpload, isAdmin, readsAudit } = useAuth();
  if (loading) return <div className="center-screen"><div className="spinner" /></div>;
  if (!user) return <Login />;
  if (error || !profile?.active) return <Pending error={error} />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="archive" element={<Search />} />
        <Route path="records/:id" element={<RecordView />} />
        <Route path="upload" element={<Only when={canUpload}><Upload /></Only>} />
        <Route path="folders" element={<Folders />} />
        <Route path="folders/:id" element={<FolderView />} />
        <Route path="admin/audit" element={<Only when={readsAudit}><AuditLog /></Only>} />
        <Route path="admin/users" element={<Only when={isAdmin}><Users /></Only>} />
        <Route path="admin/settings" element={<Only when={isAdmin}><Settings /></Only>} />
        <Route path="admin/types" element={<Only when={isAdmin}><DocumentTypes /></Only>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
