/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UC_COMMS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
