import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  limit as fsLimit
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { AlertItem, DatasetItem, InferenceResult, VelocityLog, VideoItem } from '../types';
import { auth, db, storage } from '../firebase';

export const setAuthToken = () => undefined; // no-op in Firebase-only flow

const userId = () => auth.currentUser?.uid;
const isoNow = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

export const videoApi = {
  upload: async (file: File) => {
    const id = uid();
    const path = `videos/${id}-${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, { contentType: file.type });
    const url = await getDownloadURL(storageRef);
    const doc = {
      id,
      name: file.name,
      url,
      storagePath: path,
      contentType: file.type,
      size: file.size,
      createdAt: isoNow(),
      userId: userId()
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
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, { contentType: file.type });
    const url = await getDownloadURL(storageRef);
    const doc = {
      id,
      name: file.name,
      url,
      storagePath: path,
      contentType: file.type,
      size: file.size,
      createdAt: isoNow(),
      userId: userId()
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
      userId: userId()
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
      userId: userId()
    } satisfies AlertItem & Record<string, unknown>;
    await addDoc(collection(db, 'alerts'), doc);
    if (status === 'danger') {
      try {
        await addDoc(collection(db, 'notifications'), {
          id: uid(),
          type: 'municipality_alert',
          message: `High flood alert: velocity ${velocity} m/s (threshold ${threshold} m/s)`,
          createdAt: isoNow(),
          userId: userId()
        });
      } catch (err) {
        console.error('Notification write failed', err);
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
    const warn = Number(import.meta.env.VITE_VELOCITY_WARN || '2.5');
    const dangerEnv = import.meta.env.VITE_VELOCITY_DANGER;
    const danger = dangerEnv ? Number(dangerEnv) : warn * 1.5;
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
      explanation: `Heuristic: warn >= ${warn} m/s, danger >= ${danger} m/s`
    };
    try {
      await addDoc(collection(db, 'inference_logs'), {
        id: uid(),
        ...result,
        userId: userId(),
        createdAt: isoNow()
      });
    } catch (err) {
      console.error('Inference log write failed', err);
    }
    return { data: { data: result } };
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
