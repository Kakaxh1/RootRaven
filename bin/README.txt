Place BusyBox binaries here to enable the "Install HTTP Tools" action.

Supported file names (auto-detected by device ABI):
- busybox-aarch64 (arm64-v8a)
- busybox-arm64   (arm64-v8a)
- busybox-armv7l  (armeabi-v7a/armeabi)
- busybox-arm     (armeabi-v7a/armeabi)
- busybox-x86_64  (x86_64)
- busybox-i686    (x86)
- busybox-x86     (x86)
- busybox         (fallback name for any ABI)

Expected behavior:
1) Click "Install HTTP Tools" on Android device card.
2) Tool pushes selected binary to /data/local/tmp/busybox and chmod 755.
3) "Start HTTP Server" will then try /data/local/tmp/busybox httpd.
