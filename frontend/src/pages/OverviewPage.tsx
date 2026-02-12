import { useEffect, useMemo, useState } from 'react';
import StatCard from '../components/StatCard';
import LineChart from '../components/LineChart';
import DataTable from '../components/DataTable';
import { alertsApi, rainApi, velocityApi, waterLevelApi } from '../api/client';
import { AlertItem, RainLog, VelocityLog, WaterLevelLog } from '../types';

const OverviewPage = () => {
  const [velocity, setVelocity] = useState<VelocityLog[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [waterLevels, setWaterLevels] = useState<WaterLevelLog[]>([]);
  const [rains, setRains] = useState<RainLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [velRes, alertRes, waterRes, rainRes] = await Promise.all([
          velocityApi.list(),
          alertsApi.list(),
          waterLevelApi.list(),
          rainApi.list()
        ]);
        setVelocity(velRes.data.data || []);
        setAlerts(alertRes.data.data || []);
        setWaterLevels(waterRes.data.data || []);
        setRains(rainRes.data.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const latestVelocity = velocity.at(0)?.velocity ?? 0;
  const latestWater = waterLevels.at(0)?.level ?? 0;
  const latestRain = rains.at(0)?.rate ?? 0;
  const systemStatus = latestVelocity > 0 ? 'Online' : 'Offline';
  const alertStatus = useMemo(() => {
    if (alerts.length === 0) return 'Normal';
    return alerts[0].status;
  }, [alerts]);

  const fusedRisk = useMemo(() => {
    const v = latestVelocity;
    const w = latestWater;
    const r = latestRain;
    const score = v * 0.5 + w * 0.3 + r * 0.2;
    if (score > 6) return 'danger';
    if (score > 3) return 'warning';
    return 'normal';
  }, [latestVelocity, latestWater, latestRain]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Overview</h2>
          <p className="text-sm text-slate-500">Realtime snapshot of water velocity system</p>
        </div>
        {loading && <span className="text-sm text-slate-500">Refreshing...</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="System Status" value={systemStatus} hint="Derived from latest reading" tone={systemStatus === 'Online' ? 'success' : 'warning'} />
        <StatCard title="Latest Velocity" value={`${latestVelocity.toFixed(2)} m/s`} />
        <StatCard title="Alert State" value={alertStatus} hint="Most recent alert" tone={alertStatus === 'danger' ? 'danger' : alertStatus === 'warning' ? 'warning' : 'default'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Water Level" value={`${latestWater.toFixed(2)} m`} hint="Latest water level" />
        <StatCard title="Rainfall" value={`${latestRain.toFixed(1)} mm/hr`} hint="Latest rain rate" />
        <StatCard title="Fused Risk" value={fusedRisk} hint="Velocity + water + rain" tone={fusedRisk === 'danger' ? 'danger' : fusedRisk === 'warning' ? 'warning' : 'default'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Velocity over time</h3>
            <span className="text-xs text-slate-500">Recent 50 readings</span>
          </div>
          <LineChart data={velocity.slice(0, 50).reverse()} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Recent alerts</h3>
            <span className="text-xs text-slate-500">Last 5</span>
          </div>
          <DataTable
            columns={[
              { header: 'Status', accessor: (a) => a.status },
              { header: 'Velocity', accessor: (a) => `${a.velocity} m/s` },
              { header: 'Threshold', accessor: (a) => `${a.threshold} m/s` },
              { header: 'At', accessor: (a) => new Date(a.triggeredAt).toLocaleString() }
            ]}
            rows={alerts.slice(0, 5)}
          />
        </div>
      </div>
    </div>
  );
};

export default OverviewPage;
