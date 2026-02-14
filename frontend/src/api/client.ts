import {
  addDoc,
  collection,
  doc,
  getDocs,
  setDoc,
  orderBy,
  query,
  limit as fsLimit
} from 'firebase/firestore';
import { getDownloadURL, listAll, ref, uploadBytes } from 'firebase/storage';
import {
  AlertItem,
  DatasetItem,
  EmailDispatch,
  InferenceResult,
  ModelFile,
  NotificationItem,
  RainLog,
  SiteItem,
  VelocityLog,
  VideoItem,
  WaterLevelLog
} from '../types';
import { auth, db, storage } from '../firebase';

export const setAuthToken = () => undefined; // no-op in Firebase-only flow

const userId = () => auth.currentUser?.uid;
const safeUserId = () => userId() || 'guest';
const isoNow = () => new Date().toISOString();
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_6pfgc2j';
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'template_cny2pih';
const EMAILJS_ACCESS_TOKEN = import.meta.env.VITE_EMAILJS_ACCESS_TOKEN || 'BdehdbuzRiHLgX0TMnU_L';
const MUNICIPALITY_EMAIL = import.meta.env.VITE_MUNICIPALITY_EMAIL || 'akshitar7890@gmail.com';
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'JEz195IYZP1Xkj4s8';

const sendMunicipalityEmail = async (payload: EmailDispatch) => {
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_ACCESS_TOKEN,
        template_params: {
          to_email: payload.to_email || MUNICIPALITY_EMAIL,
          to: payload.to_email || MUNICIPALITY_EMAIL,
          email: payload.to_email || MUNICIPALITY_EMAIL,
          message: payload.message,
          velocity: payload.velocity ?? '',
          threshold: payload.threshold ?? '',
          status: payload.status ?? '',
          from_name: 'Flood Monitor'
        }
      })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'EmailJS send failed');
    }
  } catch (err) {
    console.error('EmailJS dispatch failed', err);
    throw err;
  }
};

const uploadWithTimeout = async (storagePath: string, file: File, timeoutMs = 15000) => {
  const storageRef = ref(storage, storagePath);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('upload-timeout'), timeoutMs);
  try {
    // uploadBytes does not accept AbortSignal, but abort will throw from our race below
    await Promise.race([
      uploadBytes(storageRef, file, { contentType: file.type }),
      new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Upload timed out'))))
    ]);
    const url = await getDownloadURL(storageRef);
    return url;
  } finally {
    clearTimeout(timer);
  }
};

const latestDoc = async <T>(col: string, orderField: string) => {
  const snap = await getDocs(query(collection(db, col), orderBy(orderField, 'desc'), fsLimit(1)));
  const doc = snap.docs.at(0);
  return doc ? (doc.data() as T) : null;
};

export const videoApi = {
  upload: async (file: File) => {
    const id = uid();
    const path = `videos/${id}-${file.name}`;
    const url = await uploadWithTimeout(path, file, 60000);
    const doc = {
      id,
      name: file.name,
      url,
      storagePath: path,
      contentType: file.type,
      size: file.size,
      createdAt: isoNow(),
      userId: safeUserId()
    } satisfies VideoItem & Record<string, unknown>;
    await addDoc(collection(db, 'videos'), doc);
    return { data: { data: doc } };
  },
  list: async () => {
    const snap = await getDocs(query(collection(db, 'videos'), orderBy('createdAt', 'desc')));
    const items = snap.docs.map((d) => d.data() as VideoItem);
    return { data: { data: items } };
  }
};

export const datasetApi = {
  upload: async (file: File) => {
    const id = uid();
    const path = `datasets/${id}-${file.name}`;
    const url = await uploadWithTimeout(path, file, 45000);
    const doc = {
      id,
      name: file.name,
      url,
      storagePath: path,
      contentType: file.type,
      size: file.size,
      createdAt: isoNow(),
      userId: safeUserId()
    } satisfies DatasetItem & Record<string, unknown>;
    await addDoc(collection(db, 'datasets'), doc);
    return { data: { data: doc } };
  },
  list: async () => {
    const snap = await getDocs(query(collection(db, 'datasets'), orderBy('createdAt', 'desc')));
    const items = snap.docs.map((d) => d.data() as DatasetItem);
    return { data: { data: items } };
  }
};

export const velocityApi = {
  create: async (velocity: number, source: string, timestamp?: string) => {
    const id = uid();
    const doc = {
      id,
      velocity,
      source,
      timestamp: timestamp || isoNow(),
      userId: safeUserId()
    } satisfies VelocityLog & Record<string, unknown>;
    await addDoc(collection(db, 'velocity_logs'), doc);
    return { data: { data: doc } };
  },
  list: async () => {
    const snap = await getDocs(
      query(collection(db, 'velocity_logs'), orderBy('timestamp', 'desc'), fsLimit(200))
    );
    const items = snap.docs.map((d) => d.data() as VelocityLog);
    return { data: { data: items } };
  }
};

export const alertsApi = {
  create: async (threshold: number, velocity: number, status: string) => {
    const id = uid();
    const doc = {
      id,
      threshold,
      velocity,
      status,
      triggeredAt: isoNow(),
      userId: safeUserId()
    } satisfies AlertItem & Record<string, unknown>;
    await addDoc(collection(db, 'alerts'), doc);
    const notificationDoc = {
      id: uid(),
      type: 'municipality_alert',
      message: `Alert: velocity ${velocity} m/s (threshold ${threshold} m/s), status ${status}`,
      channel: 'emailjs',
      delivered: false,
      createdAt: isoNow(),
      userId: safeUserId()
    } satisfies NotificationItem & Record<string, unknown>;
    try {
      await sendMunicipalityEmail({
        to_email: MUNICIPALITY_EMAIL,
        message: notificationDoc.message,
        velocity: velocity.toFixed(2),
        threshold: threshold.toFixed(2),
        status: status
      });
      notificationDoc.delivered = true;
    } catch (err) {
      console.error('Municipality email send failed', err);
    } finally {
      try {
        await addDoc(collection(db, 'notifications'), notificationDoc);
      } catch (err) {
        console.error('Notification log write failed', err);
      }
    }
    return { data: { data: doc } };
  },
  list: async () => {
    const snap = await getDocs(
      query(collection(db, 'alerts'), orderBy('triggeredAt', 'desc'), fsLimit(200))
    );
    const items = snap.docs.map((d) => d.data() as AlertItem);
    return { data: { data: items } };
  }
};

export const inferenceApi = {
  velocity: async (velocity: number, source: string) => {
    const model = await latestDoc<ModelFile>('models', 'uploadedAt');
    const dataset = await latestDoc<DatasetItem>('datasets', 'createdAt');
    let warn = Number(import.meta.env.VITE_VELOCITY_WARN || '2.5');
    const dangerEnv = import.meta.env.VITE_VELOCITY_DANGER;
    let danger = dangerEnv ? Number(dangerEnv) : warn * 1.5;

    // Adjust thresholds based on available data/models
    if (model) {
      warn *= 0.95;
      danger *= 0.95;
    }
    if (dataset?.size && dataset.size > 3_000_000) {
      warn *= 0.9;
      danger *= 0.9;
    }

    let label: 'normal' | 'warning' | 'danger' = 'normal';
    if (velocity >= danger) label = 'danger';
    else if (velocity >= warn) label = 'warning';
    const score = Math.min(1, Math.max(0, velocity / danger));
    const result: InferenceResult = {
      velocity,
      source,
      label,
      score,
      thresholds: { warn, danger },
      explanation: `Heuristic: warn >= ${warn.toFixed(2)} m/s, danger >= ${danger.toFixed(2)} m/s${model ? ` | model: ${model.name}` : ''}${dataset ? ` | dataset: ${dataset.name}` : ''}`
    };
    try {
      await addDoc(
        collection(db, 'inference_logs'),
        {
          id: uid(),
          ...result,
          ...(model ? { modelId: model.id } : {}),
          ...(dataset ? { datasetId: dataset.id } : {}),
          userId: safeUserId(),
          createdAt: isoNow()
        } as Record<string, unknown>
      );
    } catch (err) {
      console.error('Inference log write failed', err);
    }

    if (label === 'warning') {
      try {
        await alertsApi.create(warn, velocity, 'warning');
      } catch (err) {
        console.error('Alert write failed (warning)', err);
      }
    }
    if (label === 'danger') {
      try {
        await alertsApi.create(danger, velocity, 'danger');
      } catch (err) {
        console.error('Alert write failed (danger)', err);
      }
    }
    return { data: { data: result } };
  }
};

export const modelsApi = {
  upload: async (file: File, version?: string, notes?: string) => {
    const id = uid();
    const resolvedVersion = version || `v-${new Date().toISOString()}`;
    const path = `models/${id}-${file.name}`;
    const url = await uploadWithTimeout(path, file);
    const docBody = {
      id,
      name: file.name,
      version: resolvedVersion,
      status: 'staged',
      uploadedAt: isoNow(),
      sourceUrl: url,
      mainFilePath: path,
      notes,
      userId: safeUserId()
    } satisfies ModelFile & Record<string, unknown>;
    await setDoc(doc(db, 'models', id), docBody);
    return { data: { data: docBody } };
  },
  uploadBundle: async (files: File[], version?: string, notes?: string) => {
    const id = uid();
    const resolvedVersion = version || `v-${new Date().toISOString()}`;
    const mainExts = ['.onnx', '.json', '.bin', '.tflite'];
    const uploaded: { name: string; path: string; size?: number; contentType?: string; url: string }[] = [];
    for (const file of files) {
      const rel = (file as any).webkitRelativePath || file.name;
      const path = `models/${id}/${rel}`;
      const url = await uploadWithTimeout(path, file);
      uploaded.push({ name: file.name, path, size: file.size, contentType: file.type, url });
    }
    const main = uploaded.find((u) => mainExts.some((ext) => u.name.toLowerCase().endsWith(ext))) || uploaded[0];
    const docBody = {
      id,
      name: main?.name || files[0]?.name || 'bundle',
      version: resolvedVersion,
      status: 'staged',
      uploadedAt: isoNow(),
      sourceUrl: main?.url,
      mainFilePath: main?.path,
      files: uploaded.map(({ url, ...rest }) => rest),
      notes,
      userId: safeUserId()
    } satisfies ModelFile & Record<string, unknown>;
    await setDoc(doc(db, 'models', id), docBody);
    return { data: { data: docBody } };
  },
  list: async () => {
    try {
      const snap = await getDocs(query(collection(db, 'models'), orderBy('uploadedAt', 'desc')));
      const items = snap.docs.map((d) => d.data() as ModelFile);
      if (items.length) return { data: { data: items } };
    } catch (err) {
      console.error('Model list failed (ordered), retrying unordered', err);
    }
    try {
      const snap = await getDocs(collection(db, 'models'));
      const items = snap.docs.map((d) => d.data() as ModelFile);
      if (items.length) return { data: { data: items } };
    } catch (err) {
      console.error('Model list failed (unordered)', err);
    }
    // Fallback: list from Storage bucket directly
    try {
      const root = ref(storage, 'models');
      const listing = await listAll(root);
      const items: ModelFile[] = await Promise.all(
        listing.items.map(async (item) => {
          const url = await getDownloadURL(item);
          const name = item.name;
          return {
            id: item.fullPath,
            name,
            version: 'unknown',
            status: 'staged',
            uploadedAt: isoNow(),
            sourceUrl: url,
            mainFilePath: item.fullPath
          } satisfies ModelFile;
        })
      );
      return { data: { data: items } };
    } catch (err) {
      console.error('Storage fallback list failed', err);
      return { data: { data: [] } };
    }
  }
};

export const notificationsApi = {
  create: async (message: string, channel = 'emailjs', type = 'alert') => {
    const id = uid();
    const docBody = {
      id,
      type,
      message,
      channel,
      delivered: true,
      createdAt: isoNow(),
      userId: safeUserId()
    } satisfies NotificationItem & Record<string, unknown>;
    await addDoc(collection(db, 'notifications'), docBody);
    return { data: { data: docBody } };
  },
  list: async () => {
    const snap = await getDocs(
      query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), fsLimit(200))
    );
    const items = snap.docs.map((d) => d.data() as NotificationItem);
    return { data: { data: items } };
  }
};

export const sitesApi = {
  seed: async () => {
    const id = uid();
    const docBody = {
      id,
      name: `Site ${id.slice(0, 4)}`,
      location: 'Sample River Bend',
      lat: 0,
      lon: 0,
      status: 'online',
      alertStatus: 'normal',
      lastVelocity: Math.random() * 3,
      lastWaterLevel: 0.4 + Math.random() * 0.6,
      lastRainRate: Math.random() * 10,
      lastHeartbeat: isoNow(),
      userId: safeUserId()
    } satisfies SiteItem & Record<string, unknown>;
    await addDoc(collection(db, 'sites'), docBody);
    return { data: { data: docBody } };
  },
  list: async () => {
    const snap = await getDocs(query(collection(db, 'sites'), orderBy('lastHeartbeat', 'desc')));
    const items = snap.docs.map((d) => d.data() as SiteItem);
    return { data: { data: items } };
  }
};

export const waterLevelApi = {
  create: async (level: number, siteId?: string, timestamp?: string) => {
    const id = uid();
    const docBody = {
      id,
      siteId,
      level,
      timestamp: timestamp || isoNow(),
      userId: safeUserId()
    } satisfies WaterLevelLog & Record<string, unknown>;
    await addDoc(collection(db, 'water_levels'), docBody);
    return { data: { data: docBody } };
  },
  list: async () => {
    const snap = await getDocs(
      query(collection(db, 'water_levels'), orderBy('timestamp', 'desc'), fsLimit(200))
    );
    const items = snap.docs.map((d) => d.data() as WaterLevelLog);
    return { data: { data: items } };
  }
};

export const rainApi = {
  create: async (rate: number, siteId?: string, timestamp?: string) => {
    const id = uid();
    const docBody = {
      id,
      siteId,
      rate,
      timestamp: timestamp || isoNow(),
      userId: safeUserId()
    } satisfies RainLog & Record<string, unknown>;
    await addDoc(collection(db, 'rain_logs'), docBody);
    return { data: { data: docBody } };
  },
  list: async () => {
    const snap = await getDocs(
      query(collection(db, 'rain_logs'), orderBy('timestamp', 'desc'), fsLimit(200))
    );
    const items = snap.docs.map((d) => d.data() as RainLog);
    return { data: { data: items } };
  }
};

export const authApi = {
  // Placeholder no-ops to satisfy existing imports; auth is handled via Firebase Auth directly
  register: async () => ({ data: { data: null } }),
  login: async () => ({ data: { data: null } }),
  me: async () => ({ data: { data: null } }),
  setRole: async () => ({ data: { data: null } })
};

export default {} as never;
