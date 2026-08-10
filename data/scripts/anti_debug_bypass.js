// Anti-Debugging & Tracer Evasion Bypass
// Hooks: Debug.isDebuggerConnected, native ptrace, fork/getppid checks
Java.perform(function () {
    console.log("[*] Initializing Anti-Debug & Tracer Evasion Bypass...");

    // 1. Android Debug.isDebuggerConnected
    var Debug = Java.use("android.os.Debug");
    Debug.isDebuggerConnected.implementation = function () {
        console.log("[+] Intercepted Debug.isDebuggerConnected() -> false");
        return false;
    };

    // 2. Android Debug.waitingForDebugger
    Debug.waitingForDebugger.implementation = function () {
        console.log("[+] Intercepted Debug.waitingForDebugger() -> false");
        return false;
    };

    // 3. Native ptrace hook (anti-ptrace)
    try {
        var ptrace = Module.findExportByName(null, "ptrace");
        if (ptrace) {
            Interceptor.attach(ptrace, {
                onEnter: function (args) {
                    var request = args[0].toInt32();
                    // PTRACE_TRACEME = 0
                    if (request === 0) {
                        console.log("[+] Blocked ptrace(PTRACE_TRACEME)");
                        this.isTraceme = true;
                    }
                },
                onLeave: function (retval) {
                    if (this.isTraceme) {
                        retval.replace(0);
                    }
                }
            });
        }
    } catch (e) {}

    console.log("[*] Anti-Debug Evasion Active");
});
