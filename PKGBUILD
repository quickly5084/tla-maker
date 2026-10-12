# Paquet Arch/Omarchy, construit depuis ce dossier : makepkg -f
pkgname=tla-maker
pkgver=0.2.0
pkgrel=1
pkgdesc="Créateur de tableaux de langage assisté (TLA)"
arch=(x86_64)
license=(MIT)
depends=(webkit2gtk-4.1 gtk3)
makedepends=(cargo)
options=(!debug)

build() {
  cd "$startdir/src-tauri"
  CARGO_TARGET_DIR="$startdir/src-tauri/target" cargo build --release --locked --features custom-protocol
}

package() {
  install -Dm755 "$startdir/src-tauri/target/release/tla-maker" "$pkgdir/usr/bin/tla-maker"
  install -Dm644 "$startdir/packaging/tla-maker.desktop" "$pkgdir/usr/share/applications/tla-maker.desktop"
  install -Dm644 "$startdir/src-tauri/icons/128x128.png" "$pkgdir/usr/share/icons/hicolor/128x128/apps/tla-maker.png"
}
