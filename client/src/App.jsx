import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Landing from './pages/Landing.jsx';
import Start from './pages/Start.jsx';
import Profile from './pages/Profile.jsx';
import Catalog from './pages/Catalog.jsx';
import Retailer from './pages/Retailer.jsx';
import System from './pages/System.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="start" element={<Start />} />
        <Route path="profile" element={<Profile />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="c/:token" element={<Catalog />} />
        <Route path="retailer" element={<Retailer />} />
        <Route path="system" element={<System />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
