/**
 * Shared experiment state — React Context (D19).
 *
 * No persistence (D22). Inference only on explicit Run (D21).
 * Added: selectedNode for cross-component inspection.
 */

import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type { LoadedModel, ForwardTrace, InputSample } from '../model/types';
import type { SelectedNode } from '../visualizations/interaction';
import { loadModelFromJSON } from '../model/loader';

export type TabId = 'overview' | 'network' | 'activations' | 'explain' | 'input' | 'about';

export type ModelStatus =
  | { state: 'absent' }
  | { state: 'loading' }
  | { state: 'loaded'; model: LoadedModel }
  | { state: 'error'; error: string };

export type InferenceStatus =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'complete'; trace: ForwardTrace }
  | { state: 'error'; error: string };

export interface AppState {
  activeTab: TabId;
  modelStatus: ModelStatus;
  input: InputSample | null;
  inference: InferenceStatus;
  selectedNode: SelectedNode | null;
}

const initialState: AppState = {
  activeTab: 'network',
  modelStatus: { state: 'absent' },
  input: null,
  inference: { state: 'idle' },
  selectedNode: null,
};

export type AppAction =
  | { type: 'SET_TAB'; tab: TabId }
  | { type: 'MODEL_LOADING' }
  | { type: 'MODEL_LOADED'; model: LoadedModel }
  | { type: 'MODEL_ERROR'; error: string }
  | { type: 'SET_INPUT'; input: InputSample }
  | { type: 'CLEAR_INPUT' }
  | { type: 'INFERENCE_START' }
  | { type: 'INFERENCE_COMPLETE'; trace: ForwardTrace }
  | { type: 'INFERENCE_ERROR'; error: string }
  | { type: 'SELECT_NODE'; node: SelectedNode | null };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.tab };
    case 'MODEL_LOADING':
      return { ...state, modelStatus: { state: 'loading' } };
    case 'MODEL_LOADED':
      return { ...state, modelStatus: { state: 'loaded', model: action.model } };
    case 'MODEL_ERROR':
      return { ...state, modelStatus: { state: 'error', error: action.error } };
    case 'SET_INPUT':
      return { ...state, input: action.input, inference: { state: 'idle' }, selectedNode: null };
    case 'CLEAR_INPUT':
      return { ...state, input: null, inference: { state: 'idle' }, selectedNode: null };
    case 'INFERENCE_START':
      return { ...state, inference: { state: 'running' } };
    case 'INFERENCE_COMPLETE':
      return { ...state, inference: { state: 'complete', trace: action.trace } };
    case 'INFERENCE_ERROR':
      return { ...state, inference: { state: 'error', error: action.error } };
    case 'SELECT_NODE':
      return { ...state, selectedNode: action.node };
    default:
      return state;
  }
}

const AppStateContext = createContext<AppState | null>(null);
const AppDispatchContext = createContext<React.Dispatch<AppAction> | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    let active = true;
    dispatch({ type: 'MODEL_LOADING' });
    fetch(`${import.meta.env.BASE_URL}model/mnist-mlp.json`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Model artifact request failed (${response.status}).`);
        return response.json();
      })
      .then((artifact) => {
        if (!active) return;
        const result = loadModelFromJSON(artifact);
        if (result.ok) dispatch({ type: 'MODEL_LOADED', model: result.model });
        else dispatch({ type: 'MODEL_ERROR', error: result.error });
      })
      .catch((error: unknown) => {
        if (active) dispatch({ type: 'MODEL_ERROR', error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
}

export function useAppDispatch(): React.Dispatch<AppAction> {
  const ctx = useContext(AppDispatchContext);
  if (!ctx) throw new Error('useAppDispatch must be used within AppProvider');
  return ctx;
}
