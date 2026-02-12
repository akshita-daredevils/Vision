import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import axios from 'axios';
import { v4 as uuid } from 'uuid';
import { db, storage } from './firebase.js';
import { requireAuth } from './middleware.js';
dotenv.config();
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
const port = process.env.PORT || 4000;
const apiKey = process.env.FIREBASE_API_KEY;
const velocityAlertThreshold = Number(process.env.VELOCITY_ALERT_THRESHOLD || '0');
const defaultDanger = Number(process.env.VELOCITY_DANGER_THRESHOLD || '3.5');
app.use(cors());
app.use(express.json());
// Health
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'water-velocity-backend' });
});
// Authentication endpoints using Firebase Identity Toolkit REST
app.post('/api/auth/register', async (req, res) => {
    const { email, password, role = 'user' } = req.body;
    if (!email || !password || !apiKey)
        return res.status(400).json({ message: 'Missing fields or API key' });
    try {
        const { data } = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
            email,
            password,
            returnSecureToken: true
        });
        const uid = data.localId;
        await db.collection('users').doc(uid).set({ email, role, createdAt: new Date().toISOString() }, { merge: true });
        return res.json({ data: { uid, email, role, token: data.idToken } });
    }
    catch (err) {
        console.error(err?.response?.data || err);
        return res.status(400).json({ message: err?.response?.data?.error?.message || 'Registration failed' });
    }
});
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password || !apiKey)
        return res.status(400).json({ message: 'Missing fields or API key' });
    try {
        const { data } = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
            email,
            password,
            returnSecureToken: true
        });
        const uid = data.localId;
        const userDoc = await db.collection('users').doc(uid).get();
        const role = userDoc.exists ? userDoc.data()?.role : 'user';
        return res.json({ data: { uid, email, role, token: data.idToken } });
    }
    catch (err) {
        console.error(err?.response?.data || err);
        return res.status(400).json({ message: err?.response?.data?.error?.message || 'Login failed' });
    }
});
// Auth profile helpers (for client-side Firebase auth)
app.get('/api/auth/me', requireAuth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid)
        return res.status(401).json({ message: 'Unauthenticated' });
    const doc = await db.collection('users').doc(uid).get();
    const role = doc.exists ? doc.data()?.role : 'user';
    return res.json({ data: { uid, email: req.user?.email, role } });
});
app.post('/api/auth/role', requireAuth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid)
        return res.status(401).json({ message: 'Unauthenticated' });
    const { role } = req.body;
    if (!role)
        return res.status(400).json({ message: 'Role required' });
    await db.collection('users').doc(uid).set({ email: req.user?.email, role, updatedAt: new Date().toISOString() }, { merge: true });
    return res.json({ data: { role } });
});
// Video upload
app.post('/api/upload/video', requireAuth, upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file)
        return res.status(400).json({ message: 'File required' });
    try {
        const id = uuid();
        const path = `videos/${id}-${file.originalname}`;
        const storageFile = storage.file(path);
        await storageFile.save(file.buffer, { contentType: file.mimetype });
        const [url] = await storageFile.getSignedUrl({ action: 'read', expires: '2030-01-01' });
        const doc = {
            id,
            name: file.originalname,
            url,
            storagePath: path,
            contentType: file.mimetype,
            size: file.size,
            createdAt: new Date().toISOString(),
            userId: req.user?.uid
        };
        await db.collection('videos').doc(id).set(doc);
        return res.json({ data: doc });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Upload failed' });
    }
});
app.get('/api/videos', requireAuth, async (_req, res) => {
    try {
        const snapshot = await db.collection('videos').orderBy('createdAt', 'desc').get();
        const items = snapshot.docs.map((d) => d.data());
        return res.json({ data: items });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to fetch videos' });
    }
});
// Dataset upload
app.post('/api/upload/dataset', requireAuth, upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file)
        return res.status(400).json({ message: 'File required' });
    try {
        const id = uuid();
        const path = `datasets/${id}-${file.originalname}`;
        const storageFile = storage.file(path);
        await storageFile.save(file.buffer, { contentType: file.mimetype });
        const [url] = await storageFile.getSignedUrl({ action: 'read', expires: '2030-01-01' });
        const doc = {
            id,
            name: file.originalname,
            url,
            storagePath: path,
            contentType: file.mimetype,
            size: file.size,
            createdAt: new Date().toISOString(),
            userId: req.user?.uid
        };
        await db.collection('datasets').doc(id).set(doc);
        return res.json({ data: doc });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Upload failed' });
    }
});
app.get('/api/datasets', requireAuth, async (_req, res) => {
    try {
        const snapshot = await db.collection('datasets').orderBy('createdAt', 'desc').get();
        const items = snapshot.docs.map((d) => d.data());
        return res.json({ data: items });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to fetch datasets' });
    }
});
// Velocity logs
app.post('/api/velocity', requireAuth, async (req, res) => {
    const { velocity, source = 'sensor', timestamp } = req.body;
    if (velocity === undefined)
        return res.status(400).json({ message: 'Velocity required' });
    try {
        const id = uuid();
        const doc = {
            id,
            velocity: Number(velocity),
            source,
            timestamp: timestamp || new Date().toISOString(),
            userId: req.user?.uid
        };
        await db.collection('velocity_logs').doc(id).set(doc);
        if (velocityAlertThreshold && doc.velocity > velocityAlertThreshold) {
            const alertId = uuid();
            await db.collection('alerts').doc(alertId).set({
                id: alertId,
                threshold: velocityAlertThreshold,
                velocity: doc.velocity,
                status: 'danger',
                triggeredAt: doc.timestamp,
                userId: req.user?.uid
            });
        }
        return res.json({ data: doc });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to save velocity' });
    }
});
app.get('/api/velocity', requireAuth, async (_req, res) => {
    try {
        const snapshot = await db.collection('velocity_logs').orderBy('timestamp', 'desc').limit(200).get();
        const items = snapshot.docs.map((d) => d.data());
        return res.json({ data: items });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to fetch velocity logs' });
    }
});
// Alerts
app.post('/api/alerts', requireAuth, async (req, res) => {
    const { threshold, velocity, status } = req.body;
    if (threshold === undefined || velocity === undefined || !status)
        return res.status(400).json({ message: 'Missing fields' });
    try {
        const id = uuid();
        const doc = {
            id,
            threshold: Number(threshold),
            velocity: Number(velocity),
            status,
            triggeredAt: new Date().toISOString(),
            userId: req.user?.uid
        };
        await db.collection('alerts').doc(id).set(doc);
        return res.json({ data: doc });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to save alert' });
    }
});
app.get('/api/alerts', requireAuth, async (_req, res) => {
    try {
        const snapshot = await db.collection('alerts').orderBy('triggeredAt', 'desc').limit(200).get();
        const items = snapshot.docs.map((d) => d.data());
        return res.json({ data: items });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to fetch alerts' });
    }
});
// TODO: Camera stream integration
// ML inference baseline (heuristic) for velocity
app.post('/api/inference/velocity', requireAuth, async (req, res) => {
    const { velocity, source = 'sensor' } = req.body;
    if (velocity === undefined)
        return res.status(400).json({ message: 'Velocity required' });
    const v = Number(velocity);
    if (Number.isNaN(v))
        return res.status(400).json({ message: 'Velocity must be numeric' });
    const warn = velocityAlertThreshold || 2.5;
    const danger = defaultDanger || warn * 1.5;
    let label = 'normal';
    if (v >= danger)
        label = 'danger';
    else if (v >= warn)
        label = 'warning';
    const score = Math.min(1, Math.max(0, v / danger));
    const result = {
        velocity: v,
        source,
        label,
        score,
        thresholds: { warn, danger },
        explanation: `Heuristic: warn >= ${warn} m/s, danger >= ${danger} m/s`
    };
    try {
        const id = uuid();
        await db.collection('inference_logs').doc(id).set({
            id,
            ...result,
            userId: req.user?.uid,
            createdAt: new Date().toISOString()
        });
    }
    catch (err) {
        console.error('Inference log write failed', err);
    }
    return res.json({ data: result });
});
app.listen(port, () => {
    console.log(`API listening on port ${port}`);
});
