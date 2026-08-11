{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    systems.url = "github:nix-systems/default";
  };

  outputs =
    { nixpkgs, systems, ... }:
    let
      eachSystem = nixpkgs.lib.genAttrs (import systems);
    in
    {
      packages = eachSystem (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          inherit (pkgs) lib;

          electron = pkgs.electron_43;
          nodejs = pkgs.nodejs_22;
          pnpm = pkgs.pnpm_10;

          splayer-next = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "splayer-next";
            version = "1.0.0-0900e25";
            src = ./.;

            pnpmDeps = pkgs.fetchPnpmDeps {
              inherit (finalAttrs) pname version src;
              hash = lib.fakeHash;
              fetcherVersion = 4;
            };

            cargoDeps = pkgs.rustPlatform.importCargoLock {
              lockFile = ./Cargo.lock;
            };

            nativeBuildInputs = [
              pkgs.pnpmConfigHook
              pnpm
              nodejs
              pkgs.rustPlatform.cargoSetupHook
              pkgs.cargo
              pkgs.rustc
              pkgs.python3
              pkgs.makeWrapper
              pkgs.copyDesktopItems
              pkgs.removeReferencesTo
              pkgs.pkg-config
            ];

            buildInputs = [
              electron
              pkgs.alsa-lib
              pkgs.clang
              pkgs.ffmpeg-headless
              pkgs.libclang
            ];

            strictDeps = true;
            __structuredAttrs = true;

            env.ELECTRON_SKIP_BINARY_DOWNLOAD = "1";

            postPatch = ''
              # Workaround for https://github.com/electron/electron/issues/31121
              substituteInPlace electron/main/utils/native-loader.ts \
                --replace-fail 'process.resourcesPath' "'$out/share/splayer/resources'"
            '';

            buildPhase = ''
              runHook preBuild

              for f in $(find . -path '*/node_modules/better-sqlite3' -type d); do
                (cd "$f" && (
                npm run build-release --offline --nodedir="${electron.headers}"
                rm -rf build/Release/{.deps,obj,obj.target,test_extension.node}
                find build -type f -exec \
                  ${lib.getExe pkgs.removeReferencesTo} \
                  -t "${electron.headers}" {} \;
                ))
              done

              pnpm build

              pnpm exec electron-builder \
                --dir \
                -c.electronDist=${electron.dist} \
                -c.electronVersion=${electron.version} \
                -c.extraMetadata.version=v${finalAttrs.version} \
                --config electron-builder.config.js

              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall

              mkdir -p "$out/share/splayer-next"
              cp -Pr --no-preserve=ownership dist/*-unpacked/{locales,resources{,.pak}} $out/share/splayer-next

              _icon_sizes=(16x16 32x32 96x96 192x192 256x256 512x512)
              for _icons in "''${_icon_sizes[@]}";do
                install -D public/icons/favicon-$_icons.png $out/share/icons/hicolor/$_icons/apps/splayer-next.png
              done

              makeWrapper '${lib.getExe electron}' "$out/bin/splayer-next" \
                --add-flags $out/share/splayer/resources/app.asar \
                --add-flags "\''${NIXOS_OZONE_WL:+\''${WAYLAND_DISPLAY:+--ozone-platform-hint=auto --enable-features=WaylandWindowDecorations --enable-wayland-ime=true --wayland-text-input-version=3}}" \
                --set-default ELECTRON_FORCE_IS_PACKAGED 1 \
                --set-default ELECTRON_IS_DEV 0 \
                --inherit-argv0

              runHook postInstall
            '';

            desktopItems = [
              (pkgs.makeDesktopItem {
                name = "splayer-next";
                desktopName = "SPlayer-next";
                exec = "splayer-next %U";
                terminal = false;
                type = "Application";
                icon = "splayer-next";
                startupWMClass = "SPlayer-next";
                comment = "Cross-platform desktop music player with rich lyric support";
                categories = [
                  "AudioVideo"
                  "Audio"
                  "Music"
                ];
                mimeTypes = [ "x-scheme-handler/orpheus" ];
                extraConfig.X-KDE-Protocols = "orpheus";
              })
            ];

            meta = {
              description = "Cross-platform desktop music player with rich lyric support";
              homepage = "https://splayer.imsyy.top";
              license = lib.licenses.agpl3Only;
              platforms = lib.platforms.linux;
              mainProgram = "splayer-next";
            };
          });
        in
        {
          default = splayer-next;
          inherit splayer-next;
        }
      );
    };
}
