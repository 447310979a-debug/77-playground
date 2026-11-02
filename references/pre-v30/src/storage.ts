import { createInitialState, validateState, type State } from './engine';

const DATABASE = 'qiqi-playground-v1';
const STORE = 'state';
let connection: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('此浏览器无法保存本机进度，请使用支持 IndexedDB 的浏览器。')); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(new Error('无法打开本机进度，请检查浏览器的存储权限。', { cause: request.error }));
    request.onblocked = () => reject(new Error('请先关闭其他乐园页面，再重新打开。'));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); connection = undefined; };
      resolve(database);
    };
  }).catch(error => { connection = undefined; throw error; });
  return connection;
}

export async function transact(mutator: (state: State) => State): Promise<State> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const request = store.get('main');
    let result: State;
    let failure: unknown;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => { failure ??= transaction.error; };
    transaction.onabort = () => reject(failure instanceof Error ? failure : new Error('本机保存失败，刚才的操作没有完成。请保留页面并检查可用存储空间。', { cause: failure ?? transaction.error }));
    request.onsuccess = () => {
      try {
        const current: unknown = request.result ?? createInitialState();
        validateState(current);
        result = mutator(current);
        validateState(result);
        store.put(result, 'main');
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
  });
}

export function loadState(): Promise<State> {
  return transact(state => state);
}
