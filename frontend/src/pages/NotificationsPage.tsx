import { FormEvent, useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import { notificationsApi } from '../api/client';
import { NotificationItem } from '../types';

const NotificationsPage = () => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [message, setMessage] = useState('Alert to municipality via EmailJS');
  const [channel, setChannel] = useState('emailjs');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await notificationsApi.list();
      setItems(res.data.data || []);
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
    setLoading(true);
    try {
      await notificationsApi.create(message, channel, 'manual');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to send');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Notifications</h2>
          <p className="text-sm text-slate-500">Municipality dispatch log (EmailJS)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-3">Send test notification</h3>
          <form className="space-y-3" onSubmit={submit}>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-sky-300"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Channel</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-sky-300"
              >
                <option value="emailjs">EmailJS</option>
                <option value="webhook">Webhook</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-sky-600 text-white rounded-md py-2 font-medium hover:bg-sky-700 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send notification'}
            </button>
          </form>
        </div>
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Dispatch history</h3>
            <span className="text-xs text-slate-500">Newest first</span>
          </div>
          <DataTable
            columns={[
              { header: 'Created', accessor: (n) => new Date(n.createdAt).toLocaleString() },
              { header: 'Type', accessor: (n) => n.type },
              { header: 'Channel', accessor: (n) => n.channel },
              { header: 'Delivered', accessor: (n) => (n.delivered ? 'Yes' : 'No') },
              { header: 'Message', accessor: (n) => n.message }
            ]}
            rows={items}
          />
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;
