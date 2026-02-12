# Project Run Guide

This walkthrough shows how to install, run, and share the smart drainage monitoring prototype (frontend, backend, and the TensorFlow training script).

## 0) Prerequisites
- Node.js 18+ and npm
- Python 3.10+ with pip (for the training script)
- Git (optional if you already have the folder)

## 1) Clone or download
If using Git:
```
git clone <repo-url>
cd water velocity
```
Otherwise, unzip the provided folder and open it in VS Code/terminal.

## 2) Environment setup
- Frontend Firebase config: copy `frontend/.env.example` to `frontend/.env` and fill your Firebase keys.
- Optional RAFT optical-flow model: place `raft-small.onnx` (and `raft-small.onnx_data` if present) into `frontend/public/models/` and add this to `frontend/.env`:
```
VITE_RAFT_MODEL_URL=/models/raft-small.onnx
```
- Optional ORT threading override (default is 1 to avoid COOP/COEP):
```
VITE_ORT_THREADS=1
```

## 3) Install dependencies
From the project root:
```
npm install --prefix frontend
npm install --prefix backend
```

## 4) Run in development
In two terminals (or VS Code tasks):
```
npm run dev --prefix backend
npm run dev --prefix frontend
```
Frontend dev server will print a local URL (default Vite: http://localhost:5173).
Backend dev server (ts-node-dev) will log its port (check terminal, default if configured).

## 5) Build for production
From the project root:
```
npm run build
```
This runs both `frontend` and `backend` builds. Artifacts land in `frontend/dist` and `backend/dist`.

## 6) Training the flood classifier (TensorFlow)
- Ensure the dataset is laid out as:
```
FloodIMG/
  flood/
  attenuation/
```
- Run:
```
python train_flood_model.py
```
- To point to a custom dataset path:
```
FLOOD_DATASET_DIR=/path/to/FloodIMG python train_flood_model.py
```
Outputs:
- `flood_classifier.h5` (saved model)
- `training_history.png` (accuracy plot)

## 7) Troubleshooting
- RAFT model fails to load: ensure the ONNX file is in `frontend/public/models` or set `VITE_RAFT_MODEL_URL` to a reachable URL. Restart `npm run dev --prefix frontend` after changing env.
- Cross-origin isolation warnings: threading is set to 1 by default; you can ignore the warning or keep `VITE_ORT_THREADS=1`.
- Missing Firebase config: verify `frontend/.env` matches your Firebase project.
- Dependency errors: re-run installs (`npm install --prefix frontend` and `npm install --prefix backend`).

## 8) Sharing
- You can zip the project folder (including `frontend/public/models` if you added the ONNX) and share. Your gf can follow the same steps: install deps, set `.env`, run dev servers.
