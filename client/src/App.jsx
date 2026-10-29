import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Landing from './pages/Landing.jsx';
import Start from './pages/Start.jsx';
import Profile from './pages/Profile.jsx';
import Looks from './pages/Looks.jsx';
import Look from './pages/Look.jsx';
import MyLooks from './pages/MyLooks.jsx';
import Compare from './pages/Compare.jsx';
import Shared from './pages/Shared.jsx';
import Store from './pages/Store.jsx';
import Catalog from './pages/Catalog.jsx';
import Retailer from './pages/Retailer.jsx';
import Account from './pages/Account.jsx';
import System from './pages/System.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="start" element={<Start />} />
        <Route path="profile" element={<Profile />} />
        <Route path="looks" element={<Looks />} />
        <Route path="looks/:lookId" element={<Look />} />
        <Route path="my-looks" element={<MyLooks />} />
        <Route path="compare" element={<Compare />} />
        <Route path="s/:token" element={<Shared />} />
        <Route path="shop/:code" element={<Store />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="retailer" element={<Retailer />} />
        <Route path="account" element={<Account />} />
        <Route path="system" element={<System />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
