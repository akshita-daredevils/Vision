import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/live', label: 'Live Feed' },
  { to: '/velocity', label: 'Velocity Analytics' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/sites', label: 'Sites & Health' },
  { to: '/datasets', label: 'Datasets' },
  { to: '/model', label: 'Model' }
];

const Sidebar = () => {
  const { logout, user } = useAuth();

  return (
    <aside className="w-64 bg-white border-r border-slate-200 h-screen sticky top-0 flex flex-col">
      <div className="p-6 border-b border-slate-200">
        <h1 className="text-xl font-semibold text-slate-900">Water Velocity</h1>
        <p className="text-xs text-slate-500">Monitoring Dashboard</p>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm font-medium ${
                isActive ? 'bg-sky-100 text-sky-700' : 'text-slate-700 hover:bg-slate-100'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-200 text-sm text-slate-600">
        <p className="mb-2">{user?.email}</p>
        <button
          onClick={logout}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
