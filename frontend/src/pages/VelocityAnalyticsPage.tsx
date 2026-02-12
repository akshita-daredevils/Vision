import { FormEvent, useEffect, useState } from 'react';
import LineChart from '../components/LineChart';
import DataTable from '../components/DataTable';
import { rainApi, velocityApi, waterLevelApi } from '../api/client';
import { VelocityLog } from '../types';

const VelocityAnalyticsPage = () => {
  const [logs, setLogs] = useState<VelocityLog[]>([]);
  const [velocity, setVelocity] = useState('0');
  const [source, setSource] = useState('sensor');
  const [error, setError] = useState('');
  const [waterLevel, setWaterLevel] = useState('0.0');
  const [rainRate, setRainRate] = useState('0.0');
  const [secondaryError, setSecondaryError] = useState('');

  const load = async () => {
    try {
      const res = await velocityApi.list();
      setLogs(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const numeric = Number(velocity);
    if (Number.isNaN(numeric)) {
      setError('Velocity must be numeric');
      return;
    }
    try {
      await velocityApi.create(numeric, source);
      setVelocity('0');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to record');
    }
  };

  const submitSensors = async (e: FormEvent) => {
    e.preventDefault();
    setSecondaryError('');
    const wl = Number(waterLevel);
    const rr = Number(rainRate);
    if (Number.isNaN(wl) || Number.isNaN(rr)) {
      setSecondaryError('Values must be numeric');
      return;
    }
    try {
      await Promise.all([waterLevelApi.create(wl), rainApi.create(rr)]);
      setWaterLevel('0.0');
      setRainRate('0.0');
      await load();
    } catch (err: any) {
      setSecondaryError(err?.response?.data?.message || 'Failed to record sensor data');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Velocity Analytics</h2>
          <p className="text-sm text-slate-500">Track readings and trends</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <LineChart data={logs.slice(0, 100).reverse()} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-3">Add reading</h3>
          <form className="space-y-3" onSubmit={submit}>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Velocity (m/s)</label>
              <input
                value={velocity}
                onChange={(e) => setVelocity(e.target.value)}
                type="number"
                step="0.01"
                className="w-full rounded-md border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-sky-300"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-sky-300"
              >
                <option value="sensor">Sensor</option>
                <option value="camera">Camera</option>
                <option value="upload">Upload</option>
              </select>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button
              type="submit"
              className="w-full bg-sky-600 text-white rounded-md py-2 font-medium hover:bg-sky-700"
            >
              Save reading
            </button>
          </form>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-3">Sensor fusion inputs</h3>
          <form className="space-y-3" onSubmit={submitSensors}>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Water level (m)</label>
              <input
                value={waterLevel}
                onChange={(e) => setWaterLevel(e.target.value)}
                type="number"
                step="0.01"
                className="w-full rounded-md border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-sky-300"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Rainfall (mm/hr)</label>
              <input
                value={rainRate}
                onChange={(e) => setRainRate(e.target.value)}
                type="number"
                step="0.1"
                className="w-full rounded-md border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-sky-300"
              />
            </div>
            {secondaryError && <p className="text-sm text-rose-600">{secondaryError}</p>}
            <button
              type="submit"
              className="w-full bg-emerald-600 text-white rounded-md py-2 font-medium hover:bg-emerald-700"
            >
              Save sensor data
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Reading log</h3>
          <span className="text-xs text-slate-500">Latest {logs.length}</span>
        </div>
        <DataTable
          columns={[
            { header: 'Timestamp', accessor: (r) => new Date(r.timestamp).toLocaleString() },
            { header: 'Velocity', accessor: (r) => `${r.velocity} m/s` },
            { header: 'Source', accessor: (r) => r.source }
          ]}
          rows={logs}
        />
      </div>
    </div>
  );
};

export default VelocityAnalyticsPage;
