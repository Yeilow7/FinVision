import { Outlet } from 'react-router-dom';
import TickerBar from './TickerBar';
import Navbar from './Navbar';
import SearchModal from './SearchModal';

export default function Layout() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-navy-950">
      <TickerBar />
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Outlet />
      </div>
      <SearchModal />
    </div>
  );
}
