import { pipeline, env, type FeatureExtractionPipeline } from '@xenova/transformers';

// Explicitly set the execution provider to CPU to avoid hardware probing issues
// during the Next.js build process. This is a more robust way to prevent the
// GLib-GObject errors than the 'device' passthrough option.
env.backends.onnx.executionProviders = ['cpu'];
// Allow caching of models locally on the server. This is much more efficient
// than re-downloading on every cold start. The default is true.
env.allowLocalModels = true;
// This is for browser environments and has no effect on the server.
env.useBrowserCache = false;

type ProgressCallback = (data: {
  status: string;
  file: string;
  progress: number;
  loaded: number;
  total: number;
}) => void;

class PipelineSingleton {
  static task = 'feature-extraction' as const;
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance: FeatureExtractionPipeline | null = null;

  static async getInstance(progress_callback?: ProgressCallback) {
    if (this.instance === null) {
      this.instance = await pipeline(this.task, this.model, {
        progress_callback
      });
    }
    return this.instance;
  }
}

export async function getLocalEmbedding(text: string): Promise<number[]> {
  try {
    const extractor = await PipelineSingleton.getInstance();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (error) {
    console.error("Embedding Error:", error);
    throw error;
  }
}