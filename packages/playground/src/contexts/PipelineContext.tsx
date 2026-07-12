import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { nanoid } from "nanoid";
import {
  type Pipeline,
  type PipelineStep,
  type ParamValue,
  createPipeline,
  defaultParams,
  OP_REGISTRY,
} from "@opencv-image-playground/core";

// ─── State ────────────────────────────────────────────────────────────────────

interface PipelineState {
  pipeline: Pipeline;
  selectedStepId: string | null; // which step's params are expanded
  isDirty: boolean;              // unsaved changes since last export
}

// ─── Actions ──────────────────────────────────────────────────────────────────
// Discriminated union — each action has a unique "type" string.
// TypeScript narrows the type automatically inside the reducer switch.

type Action =
  | { type: "ADD_STEP"; op: string }
  | { type: "REMOVE_STEP"; id: string }
  | { type: "REORDER_STEPS"; steps: PipelineStep[] }
  | { type: "UPDATE_PARAM"; id: string; key: string; value: ParamValue }
  | { type: "TOGGLE_STEP"; id: string }
  | { type: "SELECT_STEP"; id: string | null }
  | { type: "SET_NAME"; name: string }
  | { type: "LOAD_PIPELINE"; pipeline: Pipeline }
  | { type: "MARK_CLEAN" };

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: PipelineState, action: Action): PipelineState {
  switch (action.type) {

    case "ADD_STEP": {
      const opDef = OP_REGISTRY[action.op];
      if (!opDef) return state;
      const step: PipelineStep = {
        id: nanoid(),
        op: action.op,
        params: defaultParams(opDef),
        enabled: true,
      };
      return {
        ...state,
        isDirty: true,
        selectedStepId: step.id,
        pipeline: {
          ...state.pipeline,
          steps: [...state.pipeline.steps, step],
        },
      };
    }

    case "REMOVE_STEP":
      return {
        ...state,
        isDirty: true,
        selectedStepId: null,
        pipeline: {
          ...state.pipeline,
          steps: state.pipeline.steps.filter((s) => s.id !== action.id),
        },
      };

    case "REORDER_STEPS":
      return {
        ...state,
        isDirty: true,
        pipeline: { ...state.pipeline, steps: action.steps },
      };

    case "UPDATE_PARAM":
      return {
        ...state,
        isDirty: true,
        pipeline: {
          ...state.pipeline,
          steps: state.pipeline.steps.map((s) =>
            s.id === action.id
              ? { ...s, params: { ...s.params, [action.key]: action.value } }
              : s
          ),
        },
      };

    case "TOGGLE_STEP":
      return {
        ...state,
        isDirty: true,
        pipeline: {
          ...state.pipeline,
          steps: state.pipeline.steps.map((s) =>
            s.id === action.id ? { ...s, enabled: !s.enabled } : s
          ),
        },
      };

    case "SELECT_STEP":
      return { ...state, selectedStepId: action.id };

    case "SET_NAME":
      return {
        ...state,
        isDirty: true,
        pipeline: { ...state.pipeline, name: action.name },
      };

    case "LOAD_PIPELINE":
      return {
        pipeline: action.pipeline,
        selectedStepId: null,
        isDirty: false,
      };

    case "MARK_CLEAN":
      return { ...state, isDirty: false };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface PipelineContextValue {
  state: PipelineState;
  addStep: (op: string) => void;
  removeStep: (id: string) => void;
  reorderSteps: (steps: PipelineStep[]) => void;
  updateParam: (id: string, key: string, value: ParamValue) => void;
  toggleStep: (id: string) => void;
  selectStep: (id: string | null) => void;
  setPipelineName: (name: string) => void;
  loadPipeline: (pipeline: Pipeline) => void;
  markClean: () => void;
}

const PipelineContext = createContext<PipelineContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PipelineProvider({
  children,
  initialPipeline,
  onChange,
}: {
  children: ReactNode;
  initialPipeline?: Pipeline;
  onChange?: (pipeline: Pipeline) => void;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    pipeline: initialPipeline ?? createPipeline(),
    selectedStepId: null,
    isDirty: false,
  }));

  // Notify the host whenever the pipeline itself changes (skip the first render).
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    onChange?.(state.pipeline);
  }, [state.pipeline, onChange]);

  const addStep      = useCallback((op: string) => dispatch({ type: "ADD_STEP", op }), []);
  const removeStep   = useCallback((id: string) => dispatch({ type: "REMOVE_STEP", id }), []);
  const reorderSteps = useCallback((steps: PipelineStep[]) => dispatch({ type: "REORDER_STEPS", steps }), []);
  const updateParam  = useCallback((id: string, key: string, value: ParamValue) => dispatch({ type: "UPDATE_PARAM", id, key, value }), []);
  const toggleStep   = useCallback((id: string) => dispatch({ type: "TOGGLE_STEP", id }), []);
  const selectStep   = useCallback((id: string | null) => dispatch({ type: "SELECT_STEP", id }), []);
  const setPipelineName = useCallback((name: string) => dispatch({ type: "SET_NAME", name }), []);
  const loadPipeline = useCallback((pipeline: Pipeline) => dispatch({ type: "LOAD_PIPELINE", pipeline }), []);
  const markClean    = useCallback(() => dispatch({ type: "MARK_CLEAN" }), []);

  return (
    <PipelineContext.Provider value={{
      state, addStep, removeStep, reorderSteps,
      updateParam, toggleStep, selectStep,
      setPipelineName, loadPipeline, markClean,
    }}>
      {children}
    </PipelineContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePipeline() {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error("usePipeline must be used inside <PipelineProvider>");
  return ctx;
}
