Java.perform(function() {
    console.log("[RootRaven] Android Root Detection Bypass Script Loaded.");

    var RootPackages = [
        "com.noshufou.android.su",
        "com.noshufou.android.su.lite",
        "com.noshufou.android.su.lite.pro",
        "com.thirdparty.superuser",
        "eu.chainfire.supersu",
        "com.koushikdutta.superuser",
        "com.zachspong.temprootremovejb",
        "com.ramdroid.appquarantine",
        "com.ramdroid.appquarantinepro",
        "com.topjohnwu.magisk"
    ];

    var RootPaths = [
        "/system/app/Superuser.apk",
        "/sbin/su",
        "/system/bin/su",
        "/system/xbin/su",
        "/data/local/xbin/su",
        "/data/local/bin/su",
        "/system/sd/xbin/su",
        "/system/bin/failsafe/su",
        "/data/local/su",
        "/su/bin/su"
    ];

    // Bypass File.exists checks
    var File = Java.use("java.io.File");
    File.exists.implementation = function() {
        var path = this.getPath();
        for (var i = 0; i < RootPaths.length; i++) {
            if (path.indexOf(RootPaths[i]) !== -1) {
                console.log("[RootRaven] Bypassing exists() check for file: " + path);
                return false;
            }
        }
        return this.exists();
    };

    // Bypass Runtime.exec su checks
    var Runtime = Java.use("java.lang.Runtime");
    Runtime.exec.overload('java.lang.String').implementation = function(cmd) {
        if (cmd === "su" || cmd.indexOf("su") !== -1) {
            console.log("[RootRaven] Bypassing Runtime.exec() check for cmd: " + cmd);
            return this.exec("non_existent_command_to_fail");
        }
        return this.exec(cmd);
    };

    // Bypass PackageManager check for Root Packages
    var PackageManager = Java.use("android.app.ApplicationPackageManager");
    PackageManager.getPackageInfo.overload('java.lang.String', 'int').implementation = function(pkg, flags) {
        if (RootPackages.indexOf(pkg) !== -1) {
            console.log("[RootRaven] Bypassing PackageManager.getPackageInfo() check for pkg: " + pkg);
            throw Java.use("android.content.pm.PackageManager$NameNotFoundException").$new("Package " + pkg + " not found");
        }
        return this.getPackageInfo(pkg, flags);
    };

    console.log("[RootRaven] Hooking successful!");
});
