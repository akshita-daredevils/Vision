import { useEffect, useMemo, useState } from 'react';
import { sitesApi } from '../api/client';
import { SiteItem } from '../types';

const randomPosition = (idx: number) => {
  const seed = (idx * 37) % 100;
  return {
    top: `${20 + (seed % 60)}%`,
    left: `${10 + ((seed * 3) % 80)}%`
  } as const;
};

const SitesPage = () => {
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);

  const load = async () => {
    try {
      const res = await sitesApi.list();
      setSites(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const locateUser = () => {
    if (!('geolocation' in navigator)) {
      setLocError('Geolocation not supported in this browser.');
      return;
    }
    setLocError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setUserLoc({ lat: latitude, lon: longitude, accuracy });
        setLocating(false);
      },
      (err) => {
        setLocError(err.message || 'Unable to get location');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const seed = async () => {
    setError('');
    setLoading(true);
    try {
      await sitesApi.seed();
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to seed');
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const total = sites.length;
    const online = sites.filter((s) => s.status === 'online').length;
    const danger = sites.filter((s) => s.alertStatus === 'danger').length;
    return { total, online, danger };
  }, [sites]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Sites & Health</h2>
          <p className="text-sm text-slate-500">Locations, status, and freshness</p>
        </div>
        <div className="space-x-2">
          <button
            onClick={locateUser}
            disabled={locating}
            className="rounded-md border border-emerald-500 px-3 py-2 text-sm text-emerald-900 bg-emerald-100 hover:bg-emerald-200 disabled:opacity-50"
          >
            {locating ? 'Locating...' : 'Use my location'}
          </button>
          <button
            onClick={load}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Refresh
          </button>
          <button
            onClick={seed}
            disabled={loading}
            className="rounded-md border border-sky-500 px-3 py-2 text-sm text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50"
          >
            {loading ? 'Seeding...' : 'Add sample site'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {locError && <p className="text-sm text-rose-600">{locError}</p>}

      {userLoc && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <div>
            <div className="text-sm text-slate-500">Your location (browser consent)</div>
            <div className="text-lg font-semibold text-slate-900">
              {userLoc.lat.toFixed(5)}, {userLoc.lon.toFixed(5)}
            </div>
            <div className="text-xs text-slate-500">Accuracy: ±{userLoc.accuracy.toFixed(0)} m</div>
          </div>
          <div className="w-full h-48 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
            <img
              alt="User location map"
              className="w-full h-full object-cover"
              src={`https://staticmap.openstreetmap.de/staticmap.php?center=${userLoc.lat},${userLoc.lon}&zoom=14&size=640x320&markers=${userLoc.lat},${userLoc.lon},red-pushpin`}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">Total sites</div>
          <div className="text-2xl font-semibold text-slate-900">{stats.total}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">Online</div>
          <div className="text-2xl font-semibold text-slate-900">{stats.online}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">Danger alerts</div>
          <div className="text-2xl font-semibold text-rose-600">{stats.danger}</div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 p-4 shadow-sm text-white relative overflow-hidden" style={{ minHeight: '320px' }}>
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Map view (schematic)</h3>
            <span className="text-xs text-slate-300">Markers sized by velocity</span>
          </div>
          <div className="relative w-full" style={{ height: '260px' }}>
            {sites.map((site, idx) => {
              const pos = randomPosition(idx + site.id.length);
              const size = 12 + Math.min(20, (site.lastVelocity || 0) * 6);
              const color = site.alertStatus === 'danger' ? 'bg-rose-500' : site.alertStatus === 'warning' ? 'bg-amber-400' : 'bg-emerald-400';
              return (
                <div
                  key={site.id}
                  className={`absolute rounded-full border border-white/70 shadow-lg text-[10px] text-white flex items-center justify-center ${color}`}
                  style={{ width: `${size}px`, height: `${size}px`, top: pos.top, left: pos.left }}
                  title={`${site.name} | ${site.alertStatus}`}
                />
              );
            })}
            {sites.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm">
                No sites yet. Add a sample site.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Site details</h3>
          <span className="text-xs text-slate-500">Most recent heartbeat first</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sites.map((site) => (
            <div key={site.id} className="rounded-md border border-slate-200 p-3 bg-slate-50">
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold text-slate-900">{site.name}</div>
                <span
                  className={`text-xs px-2 py-1 rounded-md ${
                    site.alertStatus === 'danger'
                      ? 'bg-rose-100 text-rose-700'
                      : site.alertStatus === 'warning'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {site.alertStatus}
                </span>
              </div>
              <div className="text-xs text-slate-600 mb-2">{site.location}</div>
              <div className="text-sm text-slate-800">Velocity: {site.lastVelocity?.toFixed(2) ?? '—'} m/s</div>
              <div className="text-sm text-slate-800">Water level: {site.lastWaterLevel?.toFixed(2) ?? '—'} m</div>
              <div className="text-sm text-slate-800">Rain: {site.lastRainRate?.toFixed(1) ?? '—'} mm/hr</div>
              <div className="text-xs text-slate-500 mt-1">Last heartbeat: {site.lastHeartbeat ? new Date(site.lastHeartbeat).toLocaleString() : 'n/a'}</div>
            </div>
          ))}
          {sites.length === 0 && <div className="text-sm text-slate-500">No sites yet.</div>}
        </div>
      </div>
    </div>
  );
};

export default SitesPage;
