if (ObjC.available) {
    console.log("[RootRaven] iOS Jailbreak Detection Bypass Script Loaded.");

    try {
        var jbPaths = [
            "/Applications/Cydia.app",
            "/Applications/FakeCarrier.app",
            "/Applications/Icy.app",
            "/Applications/IntelliScreen.app",
            "/Applications/MxTube.app",
            "/Applications/RockApp.app",
            "/Applications/SBSettings.app",
            "/Applications/WinterBoard.app",
            "/Applications/blackra1n.app",
            "/Library/MobileSubstrate/MobileSubstrate.dylib",
            "/Library/MobileSubstrate/DynamicLibraries/Veency.plist",
            "/Library/MobileSubstrate/DynamicLibraries/LiveClock.plist",
            "/System/Library/LaunchDaemons/com.saurik.Cydia.Startup.plist",
            "/System/Library/LaunchDaemons/com.ikey.bbot.plist",
            "/bin/bash",
            "/bin/sh",
            "/etc/apt",
            "/etc/ssh/sshd_config",
            "/private/var/lib/apt",
            "/private/var/lib/cydia",
            "/private/var/tmp/cydia.log",
            "/usr/bin/sshd",
            "/usr/libexec/sftp-server",
            "/usr/libexec/ssh-keysign",
            "/usr/sbin/sshd",
            "/var/cache/apt",
            "/var/lib/apt",
            "/var/lib/cydia",
            "/var/log/syslog",
            "/var/tmp/cydia.log"
        ];

        // Hook NSFileManager fileExistsAtPath:
        var hook = ObjC.classes.NSFileManager["- fileExistsAtPath:"];
        Interceptor.attach(hook.implementation, {
            onEnter: function(args) {
                var path = ObjC.Object(args[2]).toString();
                this.isJb = false;
                for (var i = 0; i < jbPaths.length; i++) {
                    if (path === jbPaths[i]) {
                        this.isJb = true;
                        console.log("[RootRaven] Bypassing fileExistsAtPath check for: " + path);
                        break;
                    }
                }
            },
            onLeave: function(retval) {
                if (this.isJb) {
                    retval.replace(ptr("0x0")); // return NO
                }
            }
        });

        // Hook fopen for jailbreak tools
        Interceptor.attach(Module.findExportByName(null, "fopen"), {
            onEnter: function(args) {
                var path = args[0].readUtf8String();
                this.isJb = false;
                for (var i = 0; i < jbPaths.length; i++) {
                    if (path === jbPaths[i]) {
                        this.isJb = true;
                        console.log("[RootRaven] Bypassing fopen check for: " + path);
                        break;
                    }
                }
            },
            onLeave: function(retval) {
                if (this.isJb) {
                    retval.replace(ptr("0x0")); // fail to open
                }
            }
        });

    } catch (err) {
        console.log("[RootRaven] Error hooking Objective-C checks: " + err.message);
    }
} else {
    console.log("[RootRaven] ObjC is not available in this runtime context.");
}
