/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL: string
  readonly VITE_LLM_API: string
  readonly VITE_DEFAULT_USER_ID: string
  readonly VITE_DEFAULT_SUBJECT: string
  // add more env vars here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
