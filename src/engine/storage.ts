import {
  LocalModelMetadata,
  SandboxPolicy,
  WorkspaceFile,
  WorkspaceState,
} from '../types/ide';
import { getDefaultWorkspaceState } from './projectTemplates';

const DB_NAME = 'meo_studio_offline_db';
const DB_VERSION = 2;
const STORE_FILES = 'files';
const STORE_MODELS = 'models';
const STORE_SETTINGS = 'settings';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_MODELS)) {
        db.createObjectStore(STORE_MODELS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadWorkspaceState(): Promise<WorkspaceState> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction([STORE_SETTINGS, STORE_FILES], 'readonly');
      const settingsReq = tx.objectStore(STORE_SETTINGS).get('workspaceState');
      const filesReq = tx.objectStore(STORE_FILES).getAll();

      tx.oncomplete = async () => {
        const savedState = settingsReq.result?.value as WorkspaceState | undefined;
        if (savedState && Array.isArray(savedState.files) && savedState.files.length > 0) {
          resolve(savedState);
          return;
        }

        // Migrate legacy flat files if present
        const legacyFiles = (filesReq.result as WorkspaceFile[] | undefined) || [];
        if (legacyFiles.length > 0) {
          const normalizedFiles = legacyFiles.map((f) => ({
            ...f,
            folderPath: f.folderPath || '/src',
            path: f.path || `/src/${f.name}`,
          }));
          const migrated: WorkspaceState = {
            projectName: 'meo-studio-project',
            templateId: 'polyglot',
            folders: Array.from(
              new Set(['/src', ...normalizedFiles.map((f) => f.folderPath)])
            ),
            files: normalizedFiles,
            openTabIds: [normalizedFiles[0].id],
            activeFileId: normalizedFiles[0].id,
            expandedFolders: ['/src'],
          };
          await saveWorkspaceState(migrated);
          resolve(migrated);
          return;
        }

        const fresh = getDefaultWorkspaceState();
        await saveWorkspaceState(fresh);
        resolve(fresh);
      };

      tx.onerror = () => resolve(getDefaultWorkspaceState());
    });
  } catch {
    return getDefaultWorkspaceState();
  }
}

export async function saveWorkspaceState(state: WorkspaceState): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_SETTINGS, STORE_FILES], 'readwrite');
      tx.objectStore(STORE_SETTINGS).put({ key: 'workspaceState', value: state });
      const fileStore = tx.objectStore(STORE_FILES);
      fileStore.clear();
      state.files.forEach((f) => fileStore.put(f));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Fallback ignored when storage restricted
  }
}

export async function loadSavedModels(): Promise<LocalModelMetadata[]> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MODELS, 'readonly');
      const req = tx.objectStore(STORE_MODELS).getAll();
      req.onsuccess = () => resolve((req.result as LocalModelMetadata[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveModelMetadata(model: LocalModelMetadata): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MODELS, 'readwrite');
      tx.objectStore(STORE_MODELS).put(model);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function removeModelMetadata(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MODELS, 'readwrite');
      tx.objectStore(STORE_MODELS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export const DEFAULT_SANDBOX_POLICY: SandboxPolicy = {
  networkBlocked: true,
  filesystemIsolated: true,
  maxInstructionCycles: 25000,
  maxMemoryMb: 64,
  strictPointerBounds: true,
};

export async function loadSandboxPolicy(): Promise<SandboxPolicy> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_SETTINGS, 'readonly');
      const req = tx.objectStore(STORE_SETTINGS).get('sandboxPolicy');
      req.onsuccess = () => {
        resolve(req.result?.value || DEFAULT_SANDBOX_POLICY);
      };
      req.onerror = () => resolve(DEFAULT_SANDBOX_POLICY);
    });
  } catch {
    return DEFAULT_SANDBOX_POLICY;
  }
}

export async function saveSandboxPolicy(policy: SandboxPolicy): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      tx.objectStore(STORE_SETTINGS).put({ key: 'sandboxPolicy', value: policy });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}
