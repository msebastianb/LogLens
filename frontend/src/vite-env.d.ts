/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OIDC_ENABLED: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
