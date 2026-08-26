import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'node:path';

const macSigningIdentity = process.env.EDITAI_MAC_SIGN_IDENTITY?.trim();

// Assinatura Windows via Azure Trusted Signing: o workflow do CI prepara o
// signtool do SDK + o dlib do Trusted Signing e exporta estes dois envs; sem
// eles o build sai sem assinatura (SmartScreen avisa, mas funciona). A
// autenticacao vem de AZURE_TENANT_ID/CLIENT_ID/CLIENT_SECRET no ambiente.
const windowsSignToolPath = process.env.EDITAI_WIN_SIGNTOOL?.trim();
const windowsSignParams = process.env.EDITAI_WIN_SIGN_PARAMS?.trim();
const windowsSign =
  windowsSignToolPath && windowsSignParams
    ? { signToolPath: windowsSignToolPath, signWithParams: windowsSignParams }
    : undefined;

// Notarizacao so entra quando as tres credenciais estiverem no ambiente:
// EDITAI_APPLE_ID (e-mail da conta), EDITAI_APPLE_APP_PASSWORD (senha de app
// gerada em appleid.apple.com) e EDITAI_APPLE_TEAM_ID. Sem elas o build segue
// local (ad-hoc), como sempre.
const appleId = process.env.EDITAI_APPLE_ID?.trim();
const appleAppPassword = process.env.EDITAI_APPLE_APP_PASSWORD?.trim();
const appleTeamId = process.env.EDITAI_APPLE_TEAM_ID?.trim();
const canNotarize = Boolean(macSigningIdentity && appleId && appleAppPassword && appleTeamId);

const bundleEditAiRuntimes = process.env.EDITAI_BUNDLE_RUNTIMES === '1';
const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: 'com.editai.desktop',
    appCategoryType: 'public.app-category.video',
    icon: path.resolve('src/brand/editai-icon'),
    asar: true,
    // Instalador magro: as ferramentas (resources/runtimes, 1,8 GB) NAO vao
    // no pacote — o aplicativo baixa o runtime pack sob demanda no primeiro
    // boot (scripts/pack-runtimes.mjs gera; publish-runtimes.mjs publica).
    extraResource: [
      'resources/runtime-manifest.json',
      'resources/remotion-template',
      'resources/helpers',
      ...(bundleEditAiRuntimes ? ['resources/runtimes'] : []),
    ],
    osxSign:
      process.platform === 'darwin'
        ? {
            identity: macSigningIdentity || '-',
            identityValidation: Boolean(macSigningIdentity),
            optionsForFile: macSigningIdentity
              ? () => ({
                  // Producao: Hardened Runtime e entitlements que cobrem o V8
                  // e os runtimes embutidos (Python/PyTorch, FFmpeg, Node).
                  hardenedRuntime: true,
                  entitlements: path.resolve('entitlements.mac.plist'),
                })
              : () => ({ entitlements: path.resolve('entitlements.mac.dev.plist') }),
          }
        : undefined,
    osxNotarize: canNotarize
      ? {
          appleId: appleId as string,
          appleIdPassword: appleAppPassword as string,
          teamId: appleTeamId as string,
        }
      : undefined,
    windowsSign,
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'EditAI',
      setupIcon: path.resolve('src/brand/editai-icon.ico'),
      // electron-winstaller 5.4+ assina Update.exe/Setup.exe com o mesmo
      // windowsSign do packager (que ja assinou o Edvid.exe do app).
      ...(windowsSign ? { windowsSign } : {}),
    }),
    new MakerDMG(
      {
        background: path.resolve('src/brand/dmg-background-editai.png'),
        icon: path.resolve('src/brand/editai-icon.icns'),
        iconSize: 104,
        contents: (options) => [
          {
            x: 180,
            y: 220,
            type: 'file',
            path: options.appPath,
          },
          {
            x: 480,
            y: 220,
            type: 'link',
            path: '/Applications',
          },
        ],
        additionalDMGOptions: {
          window: {
            position: { x: 160, y: 80 },
            size: { width: 660, height: 400 },
          },
        },
      },
      ['darwin'],
    ),
    new MakerZIP({}, ['darwin']),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      // Edvid does not persist Electron cookies. Keeping this fuse disabled avoids
      // initializing Chromium Safe Storage (and prompting for the macOS Keychain)
      // while Codex authentication remains isolated in its own CODEX_HOME.
      [FuseV1Options.EnableCookieEncryption]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
